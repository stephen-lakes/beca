# Spec 17 — Multi-turn triage clarification — classifier

## Status: IMPLEMENTED AND VERIFIED LIVE

Drafted and shown to the project owner before any code was touched (same pattern as Specs 03 and 04); implemented after explicit go-ahead ("implement spec 17"), which is taken as sign-off on both ⚠️-flagged decisions below (the `priorClarification` request-contract addition, and the route-level round-cap override) — neither was pushed back on. All four files written/modified as scoped. `npx tsc --noEmit` and `npm run lint` both clean. Verified live against a real Supabase project and a real `OPENAI_API_KEY` via `curl` against `npm run dev` — no mocking.

**A real bug was found and fixed during live verification, not just code-reviewed:** the hand-constructed `EscalationResponseSchema.parse({...})` call in `app/api/chat/route.ts` was missing the new `needs_clarification: false` field in the object literal — the schema required it (Decision 3), but the object passed to `.parse()` didn't include it. `tsc --noEmit` did not catch this (zod's `.parse()` takes `unknown` input, not the schema's inferred type, so a missing-field bug at a `.parse()` call site isn't a TypeScript error). First live escalation curl test failed with a real `HTTP 500` and a genuine zod `"invalid_value... expected false"` error in the dev server log — fixed by adding the missing field, re-verified, passed. Recorded here rather than silently patched, per this project's standing convention (see e.g. Spec 05's citation-metadata bug, Spec 10's logging bug).

**Known, deliberate gap until Spec 18 ships:** `components/chat/ChatThread.tsx` (Spec 08) re-validates responses client-side by checking `json.escalated` and running either `EscalationResponseSchema` or `ChatResponseSchema` — it doesn't yet know about `ClarificationResponseSchema`. Unlike Spec 06 (which shipped before Spec 07/08 ever wired the UI to a real backend), this repo's UI has been live-wired to `/api/chat` since Spec 08 — so between this spec and Spec 18, a real ambiguous message hitting the deployed build will surface the client's generic `"Something went wrong. Please try again."` error state instead of a clarifying question, because client-side re-validation correctly rejects the unrecognized shape rather than mis-rendering it. This is a real, temporary, user-facing gap, not a defect in this spec — flagged explicitly rather than left implicit, and closed by Spec 18 (which depends on this spec per `00-build-plan.md`).

## Goal

Extend the urgency classifier (`lib/ai/classify.ts`) and the shared response schema (`lib/ai/schema.ts`) so it can return a third outcome — `needs_clarification` — alongside the existing urgent/not-urgent outcomes, when it can't confidently determine urgency from the message alone. `app/api/chat/route.ts` gains the ability to recognise a follow-up reply to a clarifying question and fold it back into a second, final classification pass. Deepens Spec 06's classifier; does not add a new capability area (`project-overview.md`, Approved Post-MVP Enhancements). Backend/API only — no UI. Verified via curl.

## Depends on

- Spec 06 (Urgency classifier + escalation branch — done, live-verified). This spec extends `lib/ai/schema.ts`, `lib/ai/prompts.ts`, `lib/ai/classify.ts`, and `app/api/chat/route.ts` in place; it does not replace any of Spec 06's existing urgent/not-urgent behaviour.

## Decisions (resolved before implementation)

The two ⚠️-flagged items below were shown to the project owner in draft form and approved without edits when implementation was authorized.

1. **⚠️ Needs sign-off — request contract gains an optional clarification-context field, reopening Spec 06 Decision 1.** Spec 06 Decision 1 resolved the chat request contract as stateless — `{ message: string }`, no conversation-history field — because escalation only ever needed to classify "the new message" in isolation. Multi-turn clarification breaks that assumption: re-classifying "with combined context" (`app-flow.md` Journey 4) requires the server to see the original ambiguous message and the clarifying question(s) it asked, not just the user's one-line reply. Since `architecture.md` hard invariant 4 (no raw message text persisted beyond the current session) rules out server-side conversation storage, and no session/user-identity table exists by design (`architecture.md` Storage model), the only place that context can come from is the client — which already holds the full thread in memory to render it. Proposed shape:
   ```ts
   // POST /api/chat request body
   {
     message: string,                    // the user's new reply
     priorClarification: {
       originalMessage: string,          // the message that triggered clarification
       questionsAsked: string[],         // 1–2 questions, as returned to the client
     } | null                            // absent/null on every normal turn
   }
   ```
   `priorClarification` is supplied by the client only on the one turn immediately following a Clarification-state render, sourced from what the client already displayed — not a new persistence mechanism, and nothing new is written to Supabase or logged server-side. Still fully stateless request-to-request. Flagged for sign-off because it changes an already-"resolved" decision on a shipped file, not because there's a real alternative on the table (a server-side session store would conflict with hard invariant 4 and the deliberate no-identity-table design).

2. **Classifier output becomes a 3-way outcome, not a boolean.** `UrgencyClassificationSchema` (`lib/ai/schema.ts`) changes from `{ urgent: boolean, category, severity, reasoning }` to:
   ```ts
   {
     outcome: 'not_urgent' | 'urgent' | 'needs_clarification',
     category: <DIRECTORY_CATEGORIES enum> | null,   // best-guess even on needs_clarification, see Decision 4
     severity: 'high' | 'medium' | null,               // best-guess even on needs_clarification, see Decision 4
     clarifying_questions: string[] | null,             // 1–2 items, only when outcome === 'needs_clarification'
     reasoning: string,
   }
   ```
   `category`/`severity` stay null only when `outcome === 'not_urgent'`. Constrained structurally via the zod output schema (min/max array length on `clarifying_questions`), same mechanism Spec 06 Decision 7 already uses for the category enum.
3. **New response shape: `ClarificationResponseSchema`.** `{ needs_clarification: true, questions: string[] }` (1–2 items). Existing `ChatResponseSchema` and `EscalationResponseSchema` each gain one more literal field, `needs_clarification: z.literal(false)`, alongside their existing `escalated` literal — mirroring exactly how Spec 06 Decision added `escalated: z.literal(false)` to the pre-existing `ChatResponseSchema`. The client discriminates on `escalated` first, then `needs_clarification`, rather than switching to a single unified `type` enum across all three shapes — chosen to keep this a minimal, additive diff on top of Spec 06/08's already-shipped and verified schema/client code, not a refactor of a working discriminant.
4. **⚠️ Needs sign-off — the one-round cap is enforced by the route, not trusted to the model alone.** The classifier's system prompt (`buildClassifierSystemPrompt()`) will instruct it never to return `needs_clarification` when `priorClarification` was present in the request — but per `ai-workflow-rules.md`'s "never guess on safety/escalation logic," this can't be the only safeguard. Proposed rule: if `priorClarification` is present on the request and the classifier still returns `outcome: 'needs_clarification'` (a prompt-adherence failure, not expected but must be handled), the route overrides it and treats the turn as `urgent`, using whatever `category`/`severity` best-guess the classifier returned alongside that outcome (Decision 2's `category`/`severity` fields are populated even on a `needs_clarification` outcome specifically so this override always has real values to build an escalation from, never a second model call or a null-category error). This is the same "continued uncertainty resolves to escalation, never a third question" rule from `app-flow.md`'s Clarification state, just enforced twice — once by instruction, once structurally — matching Spec 06 Decision 9's "should be unreachable, still coded for" precedent. Flagged for sign-off because it's the actual safety backstop for the entire feature's scope boundary, not a stylistic choice.
5. **Deterministic red-flag check still runs on every turn, unchanged from Spec 06.** `checkRedFlagKeywords()` runs in parallel with the classifier exactly as today (Spec 06 Decision 2); an exact-phrase red-flag match still short-circuits straight to escalation regardless of `outcome`, clarification round or not — the fast, high-precision safety net is never gated behind a clarification exchange. `needs_clarification` can only be reached when the deterministic check found nothing **and** the classifier itself is genuinely uncertain.
6. **Clarifying questions are AI-generated, not a fixed bank.** Same reasoning as Spec 06 Decision 5's opposite call: Decision 5 fixed the *escalation* message because that path can't afford a hallucinated safety claim, but a clarifying *question* ("How long has this been going on?", "Is this happening to a child or an adult?") carries no clinical claim of its own — it's an information-gathering prompt, covered by the same faithfulness framing already used for `buildClassifierSystemPrompt()`. Constrained to exactly 1–2 items structurally (Decision 2).
7. **`app/api/chat/route.ts` flow, in order:**
   1. Validate request body — `message` required; `priorClarification` optional, validated when present.
   2. `Promise.all([checkRedFlagKeywords(message), classifyUrgency(message, priorClarification)])` — `classifyUrgency` takes the optional prior-clarification context and, when present, folds it into the prompt (original message + questions asked + the new reply) per `app-flow.md` Journey 4 step 4, and additionally instructs the model that this is the final decision (no further questions allowed).
   3. Deterministic hit → escalate (unchanged from Spec 06).
   4. No deterministic hit, classifier `outcome: 'urgent'` → escalate (unchanged from Spec 06).
   5. No deterministic hit, classifier `outcome: 'needs_clarification'`, **and no `priorClarification` on this request** → return `ClarificationResponseSchema` with the classifier's `clarifying_questions`.
   6. No deterministic hit, classifier `outcome: 'needs_clarification'`, **and `priorClarification` was present** → Decision 4's override: escalate using the classifier's best-guess `category`/`severity`.
   7. `outcome: 'not_urgent'` → existing Spec 05/06 RAG flow, unchanged.
8. **Classifier-failure degrade path stays Spec 06 Decision 8, extended, not replaced.** If `classifyUrgency` still returns `null` after its one retry, the route proceeds on the deterministic check alone — exactly as today. A failed classifier can never itself trigger `needs_clarification` (it returns `null`, not an outcome), so this path cannot produce a clarification loop; worst case it falls straight through to the unchanged not-urgent RAG path or a deterministic-only escalation, same as before this spec.

## Scope

**In scope:**

- `lib/ai/schema.ts` (modify): `UrgencyClassificationSchema` restructured per Decision 2; new `ClarificationResponseSchema`; `needs_clarification: z.literal(false)` added to `ChatResponseSchema` and `EscalationResponseSchema`; new `PriorClarificationSchema` for the request body's optional field.
- `lib/ai/prompts.ts` (modify): `buildClassifierSystemPrompt()` extended to explain the three-outcome decision, when to prefer clarification over a guess, the 1–2 question cap, and the "this is final, no further questions" instruction used when `priorClarification` is present.
- `lib/ai/classify.ts` (modify): `classifyUrgency(message: string, priorClarification?: PriorClarification | null)` — builds the combined-context prompt when `priorClarification` is present; same parse/validate/one-retry contract as today.
- `app/api/chat/route.ts` (modify): request-body validation extended for the optional `priorClarification` field; branch per Decision 7; Decision 4's override implemented as its own explicit, commented branch (not folded silently into the escalation branch) so it's traceable in a future review.

**Out of scope (do not build in this spec):**

- Any UI — no `ChatThread`/`MessageBubble` rendering of the Clarification state, no wiring of the follow-up reply into the chat input. Spec 18, depends on this spec.
- Any change to `checkRedFlagKeywords()` or `findDirectoryEntry()` (`lib/directory/lookup.ts`) — untouched, reused as-is.
- Any change to `data/red_flag_rules.json` or `data/clinic_directory.json` — protected files, not touched.
- More than one clarification round under any condition — explicitly capped, see Decision 4.

## Files to create / modify

- `lib/ai/schema.ts` (modify)
- `lib/ai/prompts.ts` (modify)
- `lib/ai/classify.ts` (modify)
- `app/api/chat/route.ts` (modify)
- No new files. No `.env.example` changes — same OpenAI/Supabase credentials as Spec 06.

## Steps

1. Extend `lib/ai/schema.ts` per Decision 2/3.
2. Extend `buildClassifierSystemPrompt()` per Decision 6/7.
3. Extend `classifyUrgency()`'s signature and prompt-building per Decision 1/7.
4. Extend `app/api/chat/route.ts`'s request validation and branch logic per Decision 7, including the explicit Decision 4 override branch.
5. Verify with `curl` against `npm run dev`:
   - A genuinely ambiguous message with no red-flag phrasing and insufficient detail to classify (e.g. "my chest feels a bit off") → `needs_clarification: true`, 1–2 questions, no escalation, no RAG answer.
   - The same thread, replying to that clarification with a genuinely urgent detail (e.g. "it's crushing pain and I can't catch my breath") via `priorClarification` → `escalated: true`, correct category/severity.
   - The same thread, replying with a clearly benign detail (e.g. "it's just some mild indigestion after eating") → falls through to the normal RAG answer path, `escalated: false`, `needs_clarification: false`.
   - A reply that is still genuinely ambiguous even with `priorClarification` present → confirm Decision 4's override fires: `escalated: true`, not a second `needs_clarification` response.
   - An exact red-flag phrase on the very first message → still escalates immediately, confirming Decision 5 (clarification never gates the deterministic net).
   - A clearly non-urgent, unambiguous in-KB question → unchanged Spec 05/06 RAG path, no clarification detour.
   - Malformed/failed classifier call → degrades to deterministic-only per Decision 8, same as Spec 06 — code-reviewed, not force-reproduced live, consistent with Spec 06's own treatment of this case.

## New dependencies

None. Same SDKs as Spec 06 (`openai`, `@supabase/supabase-js`, `zod`).

## Verify checklist

- [x] `lib/ai/schema.ts`, `lib/ai/prompts.ts`, `lib/ai/classify.ts`, `app/api/chat/route.ts` written/modified
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [x] Genuinely ambiguous first message ("my chest feels a bit off") → `needs_clarification: true`, exactly 2 targeted questions, no escalation, no RAG answer — verified live via curl
- [x] Same thread, urgent follow-up detail via `priorClarification` ("crushing pain, can't catch my breath") → `escalated: true`, `category: "emergency"`, `severity: "high"`, correct `matched_entries` — verified live via curl
- [x] Same thread, benign follow-up detail ("mild indigestion") → falls through to the normal RAG path, `escalated: false`, `needs_clarification: false` — verified live via curl (this particular query also hit the pre-existing zero-retrieval short-circuit since indigestion isn't a KB topic, which is correct, expected Spec 05/06 behavior, not a Spec 17 concern)
- [x] Still-ambiguous follow-up with `priorClarification` present → Decision 4's round-cap override confirmed: `escalated: true`, `needs_clarification: false`, never a second clarification response — verified live via curl
- [x] Exact red-flag phrase on the very first message → still escalates immediately via the deterministic check, confirming Decision 5 — verified live via curl
- [x] Malformed request bodies (empty `message`; empty-string `originalMessage` / empty `questionsAsked` inside `priorClarification`) → `HTTP 400` — verified live via curl
- [x] Malformed/failed classifier call degrading to deterministic-only (Decision 8) — code-reviewed for correctness, not force-reproduced live, same treatment Spec 06 gave this case (its underlying mechanism is unchanged by this spec, only its call signature gained an extra parameter)
- [x] No `SELECT *`, no Supabase/AI-provider import outside `lib/`/`app/api/*` — confirmed by inspection, this spec touches no new import boundaries
- [x] No invariant in `architecture.md`/`code-standards.md` violated — hard invariant 4 (no raw message persisted) holds: `priorClarification` is read from the request and never written anywhere, matching the existing stateless pattern
- [x] A real bug was found and fixed via live verification (missing `needs_clarification: false` in the hand-constructed `EscalationResponseSchema.parse()` call) — see Status above, not left in place
- [x] `progress-tracker.md` updated: Spec 17 marked complete, Decisions 1–8 logged under Architecture Decisions, the two ⚠️ sign-off items logged as approved, the real bug and the Spec 18-pending frontend gap both logged

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — marked complete; Decisions 1–8 logged under Architecture Decisions; actual curl verification results logged; the two ⚠️ sign-off items logged as approved.
- `architecture.md` — no stack/provider/boundary change; no update needed.
- `database-schema.md` — no schema change; no new table or column, no persistence added.
- `app-flow.md`, `project-overview.md`, `00-build-plan.md` — already updated ahead of this spec (this doc-update pass).
- `code-standards.md` — no new naming convention introduced.
