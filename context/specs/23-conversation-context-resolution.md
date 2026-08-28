# Spec 23 — Conversation context resolution (follow-up query resolution)

## Status: COMPLETE — implemented and verified live against the real Supabase/OpenAI backend (2026-08-28).

This is the backend half of the fix for the reported bug: a follow-up message that isn't self-contained on its own (e.g. "what are the causes" after "what is cholera") is currently classified and retrieved as if it were a totally fresh, unrelated question, because `app/api/chat/route.ts` has no access to any prior turn — only the current `message` (see `progress-tracker.md`'s diagnosis, same session). `app-flow.md` Journey 1 step 2 already names this fix ("Spec 23") in a note added ahead of this draft (commit `f6ec8c1`); this spec is what actually builds it.

Split into two units, matching the exact precedent Specs 17→18 set (`ai-workflow-rules.md`: "never combine a UI change and an API-route change in the same implementation step"):

- **Spec 23 (this file)** — request contract, the resolution step itself, and the route wiring. Verified via curl by hand-passing a `recentHistory` array — no UI change.
- **Spec 24 (not yet drafted)** — `ChatThread.tsx` actually sends the thread's own recent turns on every request. Depends on 23, same relationship 18 had to 17.

## Depends on

Spec 06 (safety layer), Spec 17 (the `priorClarification` precedent this reuses the shape/pattern of), Spec 20 (capability router — this slots in immediately ahead of it).

## Goal

When a message isn't self-contained — a pronoun, "the causes," "what about that," "is it common here," no clear subject — resolve it against the thread's own recent history into a standalone query *before* the urgency classifier, the capability classifier, and retrieval all run, so the rest of the pipeline reasons about "what are the causes of cholera," not the bare, ambiguous "what are the causes." (The deterministic red-flag keyword check is the one exception — see Decision 1/7.) Skip resolution entirely (no LLM call at all) when there's no history to resolve against, or when the message is already self-contained — zero added latency/cost on the common case.

## Decisions

1. ✅ **Which layer(s) see the resolved query — resolved by the project owner, then confirmed necessary by live testing during implementation, not decided unilaterally (`ai-workflow-rules.md`: "do not guess — especially on anything touching the safety or escalation logic").**

   Initially drafted with a more conservative default: the safety layer (`checkRedFlagKeywords` + `classifyUrgency`) would keep running on the raw, verbatim message, and context resolution would run only *after* the safety layer cleared the message — feeding the resolved query into `classifyCapability`/RAG only, never `classifyUrgency`.

   **Live testing during implementation showed this default doesn't reliably fix the reported bug.** Running the exact "what is cholera" → "what are the causes" repro 3 times with `recentHistory` supplied: 2 of 3 correctly resolved and answered, but 1 of 3 returned `needs_clarification: true` ("What symptom or health problem are you asking about?") — because the urgency classifier, still looking at the raw "what are the causes," is *itself* allowed to ask a clarifying question (Spec 17) when it can't confidently judge urgency from ambiguous text alone. When it does, that response returns immediately, before context resolution's result is ever consulted — `recentHistory` never gets a chance to help. This isn't a safety miss (nothing urgent under-escalates), but it meant the fix only worked probabilistically, not reliably, for the exact scenario it was built for.

   **Confirmed by the project owner: extend resolution to `classifyUrgency` too.** `resolveQuery()` now runs first, ahead of the entire safety `Promise.all` — `classifyUrgency` reasons about the resolved query, not the raw one. `checkRedFlagKeywords` is unaffected either way and still runs on the raw, verbatim message always — it's a deterministic substring match that context can't help or hurt (e.g. "can't breathe" matches regardless of what "it" refers to), so the actual hard safety net (the thing `tests/test-queries.json`'s escalated-category pass rate is measuring) is unchanged. Re-tested the same repro 5 more times after this change: 5/5 correctly resolved and answered, zero clarification-loop regressions. A real escalation phrase (chest pain) re-tested both with and without `recentHistory` present — identical `escalated: true` response either way, confirming the safety layer's actual escalation behavior is unaffected by this change, only its handling of ambiguous-but-non-urgent phrasing improved.

2. **Request contract: a new optional `recentHistory` field, shaped like `PriorClarificationSchema`'s own precedent — client-supplied, never server-persisted.** The server stays fully stateless (Spec 17 Decision 1 invariant, unchanged): `recentHistory` is only ever read from the incoming request, never written anywhere. Added to `lib/ai/schema.ts` alongside `PriorClarificationSchema`, not defined locally in `route.ts`, so Spec 24's client code can import the same type the way it already imports `PriorClarification`.

   ```typescript
   export const ConversationTurnSchema = z.object({
     role: z.enum(["user", "assistant"]),
     text: z.string().min(1).max(2000),
   })
   export type ConversationTurn = z.infer<typeof ConversationTurnSchema>
   ```

   `route.ts`'s local `ChatRequestSchema` gains:
   ```typescript
   recentHistory: z.array(ConversationTurnSchema).max(6).optional(),
   ```

   ⚠️ **Window size = 6 turns (3 exchanges), a starting default with no eval data behind it yet — same "reasonable starting point, easy to retune later" framing Spec 19 Decision 2 used for `match_count`.** Confirm or adjust before implementation.

   Each assistant turn is flattened to plain `text` by the client (Spec 24's job) — e.g. a grounded answer's `answer` field, an escalation's `message`, a clarification's `questions` joined, a service-navigation result's `message`. This spec (23) only needs to accept and consume the already-flattened shape; it does not care which of the four response shapes produced it.

3. **The resolver never silently rewrites a query that didn't need it.** The model is asked to report `needs_resolution: boolean` alongside `resolved_query: string`, and the route only substitutes `resolved_query` when `needs_resolution` is `true` — when `false`, the original raw `message` is used unchanged, discarding the model's copy of it entirely (never trusting the model's own restatement of an already-fine query, even if byte-identical is likely). This mirrors Spec 19 Decision 3's reasoning for rejecting LLM-driven query rewriting in the retrieval-expansion case: an LLM touching text that didn't need touching is a source of unforced drift, not a benefit, and the (presumed) common case — a self-contained question — must be provably unaffected by this spec.

4. **Skip the resolution call entirely, no LLM call at all, when `recentHistory` is absent or empty.** Matches the existing "degrade, don't fail, don't add cost where there's nothing to do" pattern used throughout this codebase (Spec 06 Decision 8, capability classifier failure handling) — there's nothing to resolve against on a thread's first message, so this is a hard skip, not a classifier call that trivially returns `needs_resolution: false`.

5. **Failure handling: same parse/validate/one-retry/degrade contract every other `lib/ai/` classifier already uses (`classify.ts`, `classify-capability.ts`).** One retry on a malformed/failed structured-output call; on repeated failure, degrade to using the raw, unresolved `message` — never fail the request over a resolution-step failure. Logged as `context_resolution_outcome: "failed_degraded"` with `message.length` only, per hard invariant 4 (no raw message text ever logged) — same style as Spec 19's `retrieval_outcome` log lines.

6. **New module, not folded into an existing file: `lib/ai/resolve-context.ts`.** `code-standards.md`'s single-purpose-module principle and `lib/ai/`'s own "AI provider calls, prompts, schemas, classification" boundary — this is a distinct classification-shaped concern from urgency (`classify.ts`) and capability (`classify-capability.ts`), not a variant of either. Prompt construction still lives only in `lib/ai/prompts.ts` (`code-standards.md`), same as the other two.

7. **Where it runs in `route.ts`: first, before anything else — including the safety `Promise.all`.** Superseded by Decision 1's live-testing finding: `resolveQuery()` is now the very first thing `POST` does after parsing the request. `checkRedFlagKeywords(message)` keeps taking the raw message; `classifyUrgency(resolvedMessage, priorClarification)` takes the resolved one. `classifyCapability(resolvedMessage)` and the `service_navigation` / `healthcare_preparation` / `searchKb`/`generateAnswer` branches below all already took a `message`-shaped string and needed no further change beyond substituting `resolvedMessage` for `message`.

8. **No interaction with `priorClarification` beyond both being optional, independent request fields — matching `app-flow.md`'s own note that "the two mechanisms coexist without interfering."** A turn that carries `priorClarification` and, after the safety layer clears it, falls through to the capability/RAG path, is resolved against `recentHistory` exactly the same as any other turn — no special-casing needed. (If the safety layer escalates or asks a new clarifying question instead, resolution is never reached on that turn at all, same as today.)

## Scope

**In scope:**

- `lib/ai/schema.ts` — `ConversationTurnSchema`/`ConversationTurn`; `ResolvedContextSchema` (model output: `needs_resolution: boolean`, `resolved_query: z.string().min(1)`, `reasoning: z.string()`).
- `lib/ai/prompts.ts` — `buildContextResolutionSystemPrompt()`, `buildContextResolutionMessages(message, recentHistory)`.
- `lib/ai/resolve-context.ts` (new) — `resolveQuery(message, recentHistory)`, same parse/validate/retry-once/degrade contract as `classify.ts`/`classify-capability.ts`.
- `app/api/chat/route.ts` — `ChatRequestSchema` gains `recentHistory`; resolution call inserted per Decision 7 (first, ahead of the safety layer); `classifyUrgency`, `classifyCapability`, and the RAG path all consume the resolved message; `checkRedFlagKeywords` keeps consuming the raw one; one diagnostic log line.

**Out of scope (explicitly deferred, not silently dropped):**

- Any `ChatThread.tsx` / client change — that's Spec 24. Until Spec 24 ships, this spec has zero effect on the live UI (no client ever populates `recentHistory`), exactly the same "curl-verified, no UI" gap Spec 17 deliberately left open for Spec 18 to close.
- Any persistence of conversation history — the server stays fully stateless; `recentHistory` is read-only, per-request, never written anywhere.
- Multi-round or open-ended context tracking — this is one resolution pass per turn, bounded to a fixed recent window (Decision 2), not an agent maintaining its own evolving memory. Matches `project-overview.md`'s "no autonomous multi-step agent behaviour" boundary, the same reasoning `progress-tracker.md` already recorded for the clarification feature's one-round cap.

## Files to create / modify

- `lib/ai/schema.ts`
- `lib/ai/prompts.ts`
- `lib/ai/resolve-context.ts` (new)
- `app/api/chat/route.ts`

## Steps (as actually implemented)

1. Added `ConversationTurnSchema`/`ResolvedContextSchema` to `lib/ai/schema.ts`.
2. Added the resolver's prompt-building functions to `lib/ai/prompts.ts` — system prompt instructs: rewrite only when the newest message is genuinely ambiguous without the history; never introduce a claim, symptom, or detail not already present in the history or the message itself; when self-contained, set `needs_resolution: false` and return the message verbatim in `resolved_query` anyway (the field is still required, even though Decision 3 means the route ignores it in that case).
3. Wrote `lib/ai/resolve-context.ts` — mirrors `classify.ts`'s structure exactly (same model constant pattern, same `requestResolution`/exported-with-retry shape).
4. Wired `app/api/chat/route.ts`: extended `ChatRequestSchema`; called `resolveQuery` **first**, ahead of the safety `Promise.all` (Decision 7, revised from the initial draft's placement after it); `classifyUrgency`/`classifyCapability`/RAG all consume `resolvedMessage`, `checkRedFlagKeywords` keeps consuming `message`; added the log line (`context_resolution_outcome: "resolved" | "unchanged" | "skipped_no_history" | "failed_degraded"`, `message.length`/`resolvedMessage.length` only, never message text).
5. Verified live via curl (no browser needed — this spec has no UI surface) — see Verify checklist below for exact results.
6. Updated `progress-tracker.md` (mark complete, log real verification results including the Decision 1 course-correction) and this file.

## New dependencies

None — reuses the existing OpenAI SDK/client pattern already in place for `classify.ts`/`classify-capability.ts`.

## Verify checklist

- [x] `ConversationTurnSchema`/`ResolvedContextSchema` added to `lib/ai/schema.ts`
- [x] `lib/ai/resolve-context.ts` written, same parse/validate/retry-once/degrade contract as the two existing classifiers
- [x] `app/api/chat/route.ts`: `recentHistory` accepted, resolution wired in first (Decision 7, revised), `classifyUrgency`/`classifyCapability`/RAG path all consume `resolvedMessage`, `checkRedFlagKeywords` still consumes the raw `message`
- [x] Live-verified: the two-turn "what is cholera" → "what are the causes" curl sequence, contrasted with and without `recentHistory` — without: fails (`grounded: false`, generic "please say what you want the causes of" / observed once as a `needs_clarification` round in earlier ad hoc testing, matching the originally reported bug). With, **after the Decision 1 revision**: 5/5 runs correctly resolved to a grounded, correctly-cited cholera-causes answer (an initial 3-run test *before* the revision showed the exact 1-in-3 clarification-loop failure that motivated the revision — see Decision 1's own account)
- [x] Live-verified: a real escalation phrase ("crushing chest pain that wont go away and I am sweating heavily") unaffected — identical `escalated: true`/`category: "emergency"`/`severity: "high"` response with and without `recentHistory` present
- [x] Live-verified: `service_navigation` ("where can I get vaccinated?"), `healthcare_preparation` ("what should I bring to my antenatal appointment?"), and the independent Spec 17/18 clarification round-trip (`priorClarification`, no `recentHistory`) all still work correctly after the `classifyCapability`/`generateAnswer` argument changes — no regression in any capability-router or clarification path
- [ ] Resolver failure forced to degrade live (e.g. a deliberately invalid API key) — **not done this pass**, matching Spec 19's own precedent for its analogous case B (`B_retrieval_error`): deliberately breaking the shared live dev server's real API key wasn't done without asking first. The degrade path (`resolveQuery` catching a thrown error and returning `{ resolvedMessage: message, outcome: "failed_degraded" }`) is code-reviewed correct — mirrors `classifyUrgency`/`classifyCapability`'s already-live-verified failure handling exactly — but not independently forced live. Flagged explicitly rather than assumed, same standard this tracker applies elsewhere.
- [x] Spec 11's 20-query test set re-run with zero regression: **100.0% overall (20/20), 100.0% escalated (7/7)** — identical to pre-Spec-23, and none of these 20 queries ever carry `recentHistory`, confirming full backward compatibility with every existing caller
- [x] `npx tsc --noEmit` clean, `npm run lint` clean
- [x] No invariant in `architecture.md` or `code-standards.md` violated — hard invariant 4 (no raw message text logged: the log line carries only `message.length`/`resolvedMessage.length`) and the stateless-server invariant (`recentHistory` is read-only, never persisted) both hold
- [x] `progress-tracker.md`, `architecture.md`, this file updated

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table: `architecture.md` (new resolution step in the pipeline, Storage model or System boundaries section), `progress-tracker.md` (mark complete, log real verification results including the Decision 1 course-correction). `app-flow.md`'s existing Journey 1 step 2 note needs no wording change — the final, as-built design (resolve before the classifier too) matches what that note already said literally.
