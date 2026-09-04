# Spec 25 — Conversational intents + out-of-scope redirect

## Status: IMPLEMENTED AND VERIFIED LIVE (2026-09-04). Backend only — Spec 26 (UI) not yet built, see the "does not fix the live app alone" note below.

Reported bug: a message with no health content at all — a greeting ("Hey Beca"), a thank-you, a goodbye, "what can you help me with?", casual chitchat, or a genuinely off-topic request ("what's the weather") — is not recognized as any of those things anywhere in the pipeline today. It falls through to the unmodified RAG flow (`app/api/chat/route.ts`), `searchKb()` correctly finds nothing, and the user gets the same generic `NO_GROUNDED_INFO_MESSAGE` — "I don't have approved-source information on that topic yet..." — a live screenshot confirmed this for "Hey Beca" verbatim. That message is honest but wrong for this case: it implies a health topic wasn't covered, not that the message wasn't a health question at all.

This spec is the backend half of the fix (`ai-workflow-rules.md`: "never combine a UI change and an API-route change in the same implementation step" — same precedent Specs 06→17, 07→08, 17→18, 23→24 all followed):

- **Spec 25 (this file)** — new capability values, a new response shape, fixed reply copy, the classifier prompt update, route dispatch, and the resulting required fix to `tests/run-test-set.ts`. Verified via curl — no UI change.
- **Spec 26 (not yet drafted)** — `ChatThread.tsx` renders the new response shape.
- **Spec 27 (not yet drafted, independent of both)** — threads `recentHistory` into `generateAnswer`/`buildMessages` so a RAG answer can use conversation-supplied context (personalization) — a different call path from this spec's new conversational branch (which never calls `generateAnswer` at all), so it's independently buildable/verifiable and deliberately not folded in here.

Also explicitly out of scope for this spec, not silently dropped: the idea of Beca proactively asking a topic-narrowing follow-up question on a broad health-education question (distinct from the existing urgency-triage clarification, Specs 17/18) — a genuinely new UI/schema surface of its own, flagged as a possible future spec rather than assumed here.

## Depends on

Spec 06 (safety layer — unchanged, still runs first on every message), Spec 20 (capability router — this extends its enum and prompt), Spec 23 (this reads `resolvedMessage`, the same input the capability classifier already takes).

## Goal

Recognize five conversational intents that are not healthcare questions — `greeting`, `farewell`, `thanks`, `help_request`, `general_conversation` — and respond to each naturally, without ever touching `searchKb`/`generateAnswer`. Give the existing `out_of_scope` capability (a genuinely off-topic request) its own dedicated redirect message too, instead of falling through to the RAG no-match path — closing both the "wrong message for a greeting" bug and the "wasted retrieval call for an off-topic request" inefficiency in the same change, since both are the same underlying gap: `out_of_scope` was never supposed to look like a topic-coverage failure.

## Decisions

1. **Fixed template copy, not LLM-generated — confirmed with the project owner before drafting.** Matches every other non-RAG response already in this app: `HIGH_SEVERITY_MESSAGE`/`MEDIUM_SEVERITY_MESSAGE` (Spec 06), the service-navigation copy (`buildServiceNavigationMessage`, 2026-08-29), `NO_GROUNDED_INFO_MESSAGE` (Spec 05). Zero added latency/cost, zero risk of a model producing something off-brand for a case with no factual content to get wrong. The tradeoff — the same line every time on a long session — is the same one this app's other structured responses already accept.

2. **`general_conversation` and `out_of_scope` share one redirect message, not two.** The practical difference between "how are you doing" and "what's the weather" doesn't warrant separate copy, and it avoids asking the capability classifier to draw a low-stakes, genuinely blurry line reliably. Both use the message drafted from the project owner's own example: *"I'm mainly here to help with healthcare and wellness information. I can help with topics like vaccines, common illnesses, nutrition, hygiene, mental health, family planning, or preparing for a clinic visit. What would you like to know?"*

3. **New capabilities are excluded from `RAG_CAPABILITIES`, and `out_of_scope` is removed from it.** `RAG_CAPABILITIES` currently lists the capabilities that fall through to the unmodified `searchKb`/`generateAnswer` pipeline (`lib/ai/schema.ts`). None of the six conversational values belong there — a greeting must never trigger a vector search. Removing `out_of_scope` specifically is the direct fix for the wasted-retrieval-call half of the bug.

4. **New response shape, not a repurposed `ChatResponseSchema`.** `MessageBubble.tsx` renders `grounded: false` as a dashed, italic, muted "we don't know" bubble (`components/chat/MessageBubble.tsx`) — semantically wrong for a warm greeting or a thank-you acknowledgment, which are successful interactions, not failures. Matches the existing 4-shape precedent (`ChatResponseSchema`/`EscalationResponseSchema`/`ClarificationResponseSchema`/`ServiceNavigationResponseSchema`) exactly: a new discriminant literal, added as `false` to the other four schemas for the same uniform-shape reason every prior addition did (Spec 17 Decision 3, Spec 20's `service_navigation` note).

   ```typescript
   export const ConversationalIntentSchema = z.enum([
     "greeting",
     "farewell",
     "thanks",
     "help_request",
     "general_conversation",
     "out_of_scope",
   ])
   export type ConversationalIntent = z.infer<typeof ConversationalIntentSchema>

   export const ConversationalResponseSchema = z.object({
     escalated: z.literal(false),
     needs_clarification: z.literal(false),
     service_navigation: z.literal(false),
     conversational: z.literal(true),
     intent: ConversationalIntentSchema,
     message: z.string(),
   })
   export type ConversationalResponse = z.infer<typeof ConversationalResponseSchema>
   ```

   `ChatResponseSchema`, `EscalationResponseSchema`, `ClarificationResponseSchema`, `ServiceNavigationResponseSchema` each gain `conversational: z.literal(false)`.

   Deliberately **no** `citations`/`simple_version`/`pidgin_version` — matches the Escalation/Clarification/ServiceNavigation precedent of omitting them (Spec 09 Decision 1 scoped those two fields to the RAG-answer path specifically), not the `ChatResponseSchema` shape. The reply text is already short and plain; there's nothing to "simplify" further, and hand-writing a Pidgin variant per intent is a real but separate cost this spec doesn't take on — flagged as an Open Question below rather than silently skipped.

5. **Capability classifier prompt gains one bullet per new intent** (`buildCapabilityClassifierSystemPrompt`, `lib/ai/prompts.ts`), with examples: "Hi", "Hello", "Hey Beca" → `greeting`; "Bye", "See you" → `farewell`; "Thanks", "Thank you" → `thanks`; "What can you help me with?" → `help_request`; casual non-health chat with no clear request → `general_conversation`. The existing `out_of_scope` bullet is tightened to note it's a real request about something unrelated to health (e.g. "what's the weather", "write my resignation letter"), distinct from `general_conversation`'s aimless chat — both route to the same reply (Decision 2), but the classifier still needs a coherent definition for each to classify consistently.

6. **Route dispatch: one new branch in `app/api/chat/route.ts`,** positioned with the existing `service_navigation`/`healthcare_preparation` branches — after the emergency backstop, before the RAG fallthrough. If `capability` is one of the six conversational values, build and return `ConversationalResponseSchema` from the matching fixed constant. No `searchKb`, no `generateAnswer`, no directory lookup — the cheapest possible response path in the app, by design.

7. **Required test-harness fix, not a new feature: `tests/run-test-set.ts`.** The 5 existing "refused" fixture queries (`tests/test-queries.json` — smartphone, taxes, recipe, resignation letter, weather) are genuinely `out_of_scope` and will now return `ConversationalResponseSchema`, not `ChatResponseSchema`. `classify()`'s "refused" branch currently requires `grounded === false` plus non-empty `simple_version`/`pidgin_version` — fields the new shape doesn't carry (Decision 4). `ChatApiResponseSchema` and `classify()` need to accept either shape as a valid refusal: `escalated === false` and (`grounded === false` **or** `conversational === true`). This is required to keep Spec 11's suite passing after this spec, not new test coverage — flagged separately below as an Open Question about whether new conversational-intent test queries should also be added.

8. **Failure handling: none needed beyond what already exists.** This spec adds no new LLM call — it only adds new output values to the existing capability classifier and a new deterministic dispatch branch. `classifyCapability`'s existing one-retry/degrade contract (Spec 20, unchanged) already covers the case where the classifier fails entirely; on that path capability defaults to `"health_education"` (existing fallback in `route.ts`) and the message falls through to the RAG pipeline as it does today — a degraded but safe outcome (worst case, a greeting gets a "no grounded info" style answer once, same as today's bug, not a broken request).

## Scope

**In scope:**

- `lib/ai/schema.ts` — `CAPABILITIES` gains the five new values; `RAG_CAPABILITIES` drops `out_of_scope`; `ConversationalIntentSchema`/`ConversationalResponseSchema`; `conversational: z.literal(false)` added to the four existing response schemas; new fixed-copy constants (`GREETING_MESSAGE`, `FAREWELL_MESSAGE`, `THANKS_MESSAGE`, `HELP_REQUEST_MESSAGE`, `OUT_OF_SCOPE_MESSAGE` — reused for both `general_conversation` and `out_of_scope`).
- `lib/ai/prompts.ts` — `buildCapabilityClassifierSystemPrompt()` extended per Decision 5.
- `app/api/chat/route.ts` — new dispatch branch per Decision 6.
- `tests/run-test-set.ts` — required fix per Decision 7.

**Out of scope (explicitly deferred, not silently dropped):**

- Any `components/chat/` change — that's Spec 26. Until it ships, this spec has zero effect on the live UI: the client's existing 4-way response re-validation (`ChatThread.tsx`) doesn't recognize the new shape, so a real conversational reply would fail client-side validation and surface the generic error state — the same "curl-verified, no UI yet" gap Spec 23 deliberately left for Spec 24 to close. **This means Spec 25 alone does not fix the live app** — it's the backend half only, same relationship every prior split-spec pair had.
- `generateAnswer`/`buildMessages`/personalization via `recentHistory` — Spec 27.
- Pidgin/simple-language variants of the new fixed copy — Open Question below.
- New evaluation coverage beyond the required `run-test-set.ts` fix — Open Question below.

## Files to create / modify

- `lib/ai/schema.ts`
- `lib/ai/prompts.ts`
- `app/api/chat/route.ts`
- `tests/run-test-set.ts`

## Steps (as actually implemented)

1. Added `ConversationalIntentSchema`/`ConversationalResponseSchema` and the five new fixed-copy constants to `lib/ai/schema.ts`; extended `CAPABILITIES` with the five new values; removed `out_of_scope` from `RAG_CAPABILITIES`; added a new `CONVERSATIONAL_CAPABILITIES` array (the six-value dispatch list, mirroring `RAG_CAPABILITIES`'s own precedent for naming a capability group rather than inlining it at the call site); added `conversational: z.literal(false)` to the four existing response schemas.
2. Extended `buildCapabilityClassifierSystemPrompt()` in `lib/ai/prompts.ts` with the six intent bullets per Decision 5, plus tightened the existing `out_of_scope` bullet to distinguish it from the new `general_conversation`.
3. Added the dispatch branch to `app/api/chat/route.ts` per Decision 6, plus a small `isConversationalCapability()` type guard and a `CONVERSATIONAL_MESSAGES` lookup table (mirrors `NAVIGATION_SERVICE_LABELS`'s existing pattern) so the branch itself stays a few lines.
4. Fixed `tests/run-test-set.ts`'s `ChatApiResponseSchema`/`classify()` per Decision 7 — the "refused" branch now accepts either the pre-existing grounded-refusal shape or the new `conversational: true` shape.
5. **A real gap was caught only by tracing every hand-constructed schema object in `route.ts`, not just the new one — flagged here rather than left implicit.** Adding `conversational: z.literal(false)` to the four existing schemas is invisible to `tsc` at every `SchemaName.parse({...})` call site in `route.ts` (zod's `.parse()` takes `unknown`, not the schema's inferred input type — the exact same blind spot Spec 17's own header comment already documented for its own analogous miss). `npx tsc --noEmit` only caught the one violation inside `lib/ai/client.ts` (a typed return value, not a `.parse()` call). The other four hand-built response objects in `route.ts` (`buildEscalationResponse`, the clarification branch, the service-navigation branch, and the deterministic zero-retrieval `ChatResponseSchema.parse`) needed `conversational: false` added by hand, found by grepping every `ResponseSchema.parse(` call site directly rather than trusting the type-checker alone.
6. Verified live via curl against the project owner's already-running dev server (no browser needed — no UI surface yet) — see Verify checklist.
7. Updated `progress-tracker.md` and this file's Status line.

## New dependencies

None.

## Open Questions (not resolved before implementation — carried forward, not silently dropped)

The project owner said "Implement it" without addressing either question below; both were already resolved at the *decision* level (Decision 4 excludes `simple_version`/`pidgin_version` from the new shape; Decision 7 scopes the test-harness fix to the minimum required), so implementation proceeded on those defaults rather than blocking. Still open for a future pass:

- **Pidgin/simple-language variants of the five new fixed messages?** Every other user-facing fixed string in this app (escalation copy is the one deliberate exception, Spec 09 Decision 1) either comes with Pidgin/simple companions or is itself already maximally plain. Not added here — `ConversationalResponseSchema` has no `simple_version`/`pidgin_version` fields at all (Decision 4).
- **Should new conversational-intent test queries be added**, either to `tests/test-queries.json` (widening its `category` enum) or as a new `evaluation/conversational_intents.json` + `run-capability-eval.ts` entry (the pattern Spec 20 used for its own new capabilities)? Not added here — Decision 7's fix only covers the minimum required to keep the existing 20-query suite passing; the six new intents have no dedicated regression coverage of their own yet, only the one-off live curl checks below.

## Verify checklist

- [x] `ConversationalResponseSchema` and the five fixed-copy constants added to `lib/ai/schema.ts`; `CAPABILITIES`/`RAG_CAPABILITIES` updated; `conversational: false` added to the four existing schemas (and, per step 5 above, to every hand-constructed `.parse()` call site in `route.ts`, not just the ones `tsc` caught)
- [x] `buildCapabilityClassifierSystemPrompt()` updated with the six intent bullets
- [x] `app/api/chat/route.ts` dispatches all six conversational capabilities to `ConversationalResponseSchema`, never reaching `searchKb`/`generateAnswer`
- [x] Live curl: "Hey Beca" (the exact reported repro) → `conversational: true`, `intent: "greeting"`, the correct fixed message — not `NO_GROUNDED_INFO_MESSAGE`. Confirmed.
- [x] Live curl: a thank-you ("Thank you so much!" → `intent: "thanks"`), a goodbye ("Bye, thanks for the help" → `intent: "farewell"`), "What can you help me with?" (→ `intent: "help_request"`), casual chitchat ("How are you doing today?" → `intent: "general_conversation"`), and a genuinely off-topic request ("What's the best smartphone to buy in 2026?" → `intent: "out_of_scope"`) — all five confirmed live, each returning the correct intent and fixed message, `conversational: true` in every case
- [x] Live curl: a real health question (cholera) and a real escalation phrase (child with fever and convulsions) both unaffected — confirmed identical shape/content to pre-Spec-25, both now correctly carrying `conversational: false`
- [x] `tests/run-test-set.ts` fixed and re-run: **100.0% overall (20/20) / 100.0% escalated (7/7)**, unchanged from pre-Spec-25. Directly confirmed (not just inferred from the pass rate) that the fix is actually exercised, not coincidentally passing: a direct curl of fixture #9 ("smartphone") returns `conversational: true, intent: "out_of_scope"`, the new shape, not the old `grounded: false` one.
- [x] `npx tsc --noEmit` clean, `npm run lint` clean
- [x] No invariant in `architecture.md`/`code-standards.md` violated — the safety layer (deterministic red-flag check + AI urgency classifier) is unmodified and still runs unconditionally before the capability router on every message; the six new capabilities are purely a routing-layer addition downstream of it
- [x] `progress-tracker.md`, this file's Status line updated

**Not done this pass, flagged rather than assumed:** forcing `classifyCapability`'s own failure/degrade path live for one of the six new intents specifically (would need a deliberately broken API key on the shared live dev server — the same technique this project has repeatedly chosen not to use without asking first, e.g. Spec 19's case B, Spec 23's resolver failure path). The degrade behavior itself is unchanged by this spec (Decision 8) and already live-verified for the capability classifier in general (Spec 20) — not re-forced here for the specific new branch.

**This spec alone does not fix the live app** — per the Scope section above, `ChatThread.tsx`'s client-side response re-validation doesn't yet recognize `ConversationalResponseSchema` (still a 4-way check: `escalated` → `needs_clarification` → `service_navigation` → default `ChatResponse`). Until Spec 26 ships, a real "Hey Beca" typed into the live UI will fail client-side validation and show the generic error state, not the greeting reply — confirmed by reading `ChatThread.tsx`'s current validation chain, not assumed. Backend-verified correct via curl above; the same "curl-verified, no UI yet" gap Spec 23 deliberately left for Spec 24 to close.

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table: `progress-tracker.md` (mark complete, log real verification results); `app-flow.md` (a new state — "conversational reply" — alongside the existing 7 chat-screen states, once Spec 26 gives it a UI; may be deferred to that spec instead, since this one has no visible state on its own).
