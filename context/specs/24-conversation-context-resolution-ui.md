# Spec 24 — Conversation context resolution — UI wiring

## Status: IMPLEMENTED (2026-08-29). Decision 2's window-size question was discussed with the project owner before implementation (a smaller window was proposed on a latency-before-safety-layer argument) and resolved: run with `HISTORY_WINDOW = 6` as originally drafted.

**Verification scope for this pass, same standard Spec 18 set for its own identical situation:** this is a pure client-side rendering/wiring change with no server code touched (Spec 23's backend was already live-verified via curl in its own pass), and this session has no browser available. What *was* verified: `tsc`/`lint` clean against the real types (`ChatTurn`, `ConversationTurn`, the extended `requestAnswer` signature all type-check, not stubbed); a real `npm run dev` smoke test — `GET /` still returns `HTTP 200` with no compile/render error after the change; `toConversationTurn`'s discriminant order traced by hand against the render branch's own order; `getRecentHistory`'s "called before the new user turn is appended" contract traced by hand against `handleSubmit`'s actual append order, the same way Spec 18 traced `getPriorClarification`'s identical contract. **Not independently verified this pass — needs a real browser:** the actual interactive round-trip (typing a follow-up, confirming the request body really carries `recentHistory` via the network tab, confirming the cholera repro is fixed end-to-end through the live UI, confirming `lastRecentHistory` survives a real network failure via "Try again"). Flagged explicitly rather than assumed passing — the same gap Spec 18 itself left open for its own analogous claims.

The second and final unit of the conversation-context-resolution work. Spec 23 (the resolver + `app/api/chat/route.ts` wiring) is complete and live-verified via curl, but has **zero effect on the live UI today** — no client anywhere populates the `recentHistory` field Spec 23's `ChatRequestSchema` accepts, so every real request still omits it and `resolveQuery()` still hard-skips (Spec 23 Decision 4) on every single turn in production. This spec closes that gap: `ChatThread.tsx` starts sending the thread's own bounded recent-turn history on every request, exactly the same relationship Spec 18 had to Spec 17.

## Goal

Make the reported bug (a follow-up like "what are the causes" after "what is cholera" losing the subject) actually fixed in the live app, not just fixed at the API layer. Matches `00-build-plan.md` unit 24: "`ChatThread.tsx` sends the thread's own bounded recent-turn history (flattened to plain text per turn) on every request, so Spec 23's resolver has something to resolve against."

## Depends on

- Spec 23 (conversation context resolution — resolver + API route) — done, live-verified. This spec sends `ConversationTurnSchema`-shaped data and reads no new response shape; no backend change is needed or made here.
- Spec 18 (triage clarification UI) — this spec modifies the exact same `components/chat/ChatThread.tsx` Spec 18 built, reusing its `lastPriorClarification`/timing-before-append pattern directly rather than inventing a new one.

## Decisions

1. **No new component.** Unlike Spec 18 (which needed `ClarificationCard` for a new visible state), this spec adds no new rendered UI — `recentHistory` is invisible request-shaping data, not a new response shape or screen state. `app-flow.md` needs no new state entry.

2. **New pure helper, `getRecentHistory(messages: ChatTurn[]): ConversationTurn[]`, mirroring `getPriorClarification`'s exact contract (Spec 18 Decision 7).** Must be called with `messages` as it stood immediately before the new user turn is appended — same timing rule, same reason: this is a request-shaping function reading past state, not a live subscription.

   ```typescript
   const HISTORY_WINDOW = 6 // matches lib/ai/schema.ts's ConversationTurnSchema array .max(6)

   function toConversationTurn(turn: ChatTurn): ConversationTurn {
     if (turn.role === "user") {
       return { role: "user", text: turn.text }
     }
     // Same discriminant order the per-turn render branch already uses
     // (escalated → needs_clarification → service_navigation → plain
     // ChatResponse) — flattens whichever of the four assistant response
     // shapes produced this turn down to its one user-facing text field.
     // Spec 23's resolver only cares about the text, never which shape
     // produced it.
     const text = turn.escalated
       ? turn.message
       : turn.needs_clarification
         ? turn.questions.join(" ")
         : turn.service_navigation
           ? turn.message
           : turn.answer
     return { role: "assistant", text }
   }

   function getRecentHistory(messages: ChatTurn[]): ConversationTurn[] {
     return messages
       .map(toConversationTurn)
       .filter((turn) => turn.text.length > 0) // ConversationTurnSchema requires min(1)
       .slice(-HISTORY_WINDOW)
   }
   ```

   ✅ **`HISTORY_WINDOW = 6`, confirmed by the project owner.** A smaller window (4 — the last 2 exchanges) was proposed instead, on the reasoning that Spec 23's Decision 1 revision put context resolution ahead of the safety layer, so every extra turn in the window adds latency before `classifyUrgency` runs, even on a message that turns out to be a genuine emergency — and that the realistic failure mode (short pronoun/ellipsis follow-ups) mostly only needs the immediately preceding exchange anyway. **Confirmed to run with 6 as originally drafted instead.** `HISTORY_WINDOW = 6` still matches Spec 23's own server-side cap exactly (`ChatRequestSchema.max(6)`) — if that cap is ever retuned, this constant needs to move with it (a coupling, not duplicated logic to keep in sync by hand elsewhere — this is the only other place `6` appears). Not empirically tuned either way — a reasonable default, easy to revisit once there's real usage to look at, same spirit as Spec 19's retrieval-tuning numbers.

3. **`lastRecentHistory` state, added alongside `lastMessage`/`lastPriorClarification` (Spec 10 Decision 8, Spec 18 Decision 8), for the identical reason.** `getRecentHistory()` can only be correctly computed from `messages` *before* the new user turn is optimistically appended, but `ErrorState`'s "Try again" button calls `requestAnswer` again later, after that append already happened. `handleSubmit` computes it once, stores it in `lastRecentHistory`, and both the initial call and the retry call read from that stored value.

4. **`requestAnswer(message, priorClarification, recentHistory)` gains a third parameter**, threaded straight into the POST body (`JSON.stringify({ message, priorClarification, recentHistory })`) — Spec 23's `ChatRequestSchema` already accepts this field as `.max(6).optional()`, so always sending the (possibly empty) array is valid and simplest, matching Spec 18 Decision 9's identical reasoning for `priorClarification`.

5. **No change to client-side response re-validation.** `recentHistory` is outgoing-only request data — it never appears in any response shape, so the existing 4-way `escalated`/`needs_clarification`/`service_navigation`/default re-validation branch (Spec 18/20) is untouched.

6. **`getRecentHistory` runs on the full `messages` array regardless of turn type — no filtering out escalation/clarification/service-navigation turns.** A prior escalation or service-navigation card is still real conversational context (e.g. "where can I get vaccinated?" → a service card → "is that free?" plausibly needs the prior turn's `service` context). Excluding certain turn types would be a second, undocumented judgment call layered on top of Spec 23's own resolver, which is already trusted to judge relevance — the client's only job is supplying the raw material, not pre-filtering it.

7. **No client-side attempt to detect or special-case a turn produced during a `priorClarification` exchange.** Matches Spec 23 Decision 8 exactly: `recentHistory` and `priorClarification` are independent, optional fields that coexist on the same request without interfering — the client already computes both from the same `messages` state via two separate, uncoupled helpers (`getPriorClarification`, `getRecentHistory`), and sends both, every time.

## Scope

**In scope:**

- `components/chat/ChatThread.tsx` (modify):
  - New `toConversationTurn`/`getRecentHistory` helpers (Decision 2).
  - New `lastRecentHistory` state (Decision 3).
  - `requestAnswer()` signature and POST body extended to a third parameter (Decision 4).
  - `handleSubmit()` computes and stores `recentHistory` before appending the new user turn (Decisions 2–3), alongside the existing `priorClarification` computation.
  - `ErrorState`'s `onRetry` call site updated to pass `lastRecentHistory` alongside `lastMessage`/`lastPriorClarification`.
- Import `ConversationTurn` (type-only) from `@/lib/ai/schema` alongside the existing `PriorClarification` import.

**Out of scope (do not build in this spec):**

- Any change to `lib/ai/schema.ts`, `lib/ai/prompts.ts`, `lib/ai/resolve-context.ts`, or `app/api/chat/route.ts` — Spec 23 already shipped and live-verified everything this spec's UI writes to.
- Any new rendered component or visible UI state (Decision 1).
- Retuning `HISTORY_WINDOW`/the server's `.max(6)` cap — inherited as-is from Spec 23, not reopened here.
- Any change to `EmptyState.tsx`, `DisclaimerBar.tsx`, `MessageBubble.tsx`, `EscalationCard.tsx`, `ClarificationCard.tsx`, or `ServiceResultsCard.tsx` — untouched; this spec only changes what `ChatThread.tsx` sends, never how anything renders.

## Files to create / modify

- `components/chat/ChatThread.tsx` (modify)
- No `.env.example`, `lib/`, `app/api/*`, or other component changes.

## Steps

1. Modify `components/chat/ChatThread.tsx` per Decisions 2–4: add `toConversationTurn`/`getRecentHistory`; add `lastRecentHistory` state; extend `requestAnswer()`'s signature and POST body; update `handleSubmit()` to compute and store `recentHistory` before the optimistic user-turn append; update the retry call site.
2. Verify against `npm run dev`, hitting the real deployed Supabase/OpenAI backend (Spec 23 is live):
   - In a real browser: ask "what is cholera", then ask "what are the causes" in the same thread — confirm the second turn renders a genuinely grounded, correctly-cited cholera-causes answer, not the pre-Spec-23/24 fresh-session failure from the original bug report.
   - Confirm via the network tab (or a temporary log) that the second request's body actually carries a non-empty `recentHistory` array with the correct prior turn(s) — not a `{ message }`-only request with the fix silently inert.
   - A first message in a fresh thread sends `recentHistory: []` (or omits it) — confirm no behavior change from pre-Spec-24 on a thread's first turn.
   - A real red-flag phrase, asked as a follow-up in an existing thread (so `recentHistory` is non-empty), still escalates correctly — confirms Spec 23's Decision-1 revision (resolution feeding `classifyUrgency`) holds up with real prior turns, not just the hand-built curl history used in Spec 23's own verification.
   - A simulated network failure on a follow-up question, followed by "Try again", resends with `recentHistory` intact — confirms `lastRecentHistory` round-trips through a real error/retry cycle, mirroring Spec 18's identical check for `lastPriorClarification`.
   - `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly.
3. Update `progress-tracker.md` (mark complete, log real verification results).

## New dependencies

None.

## Verify checklist

- [x] `components/chat/ChatThread.tsx` modified per Decisions 2–4
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly — confirmed via a real `GET /` returning `HTTP 200` with no compile/render error in the dev server log
- [x] `toConversationTurn`/`getRecentHistory`'s discriminant order and pre-append timing contract traced by hand against the render branch and `handleSubmit`'s actual append order, respectively
- [ ] **Not independently verified this pass — no browser available:** the cholera → "what are the causes" repro fixed end-to-end through the real UI; the follow-up request's body actually carrying `recentHistory` (confirmed via network inspection); a red-flag follow-up still escalating correctly through the real UI; the retry path preserving `lastRecentHistory` through a real network failure. Code-reviewed against the written decisions instead — see Status above.
- [x] `progress-tracker.md` updated

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — marked complete; verification results logged.
- `architecture.md` — no change expected; Spec 23's entry already describes the resolution step and `recentHistory`'s contract, which this spec fulfills rather than alters.
- `app-flow.md` — no change; Journey 1 step 2 already describes exactly what this spec makes live.
- `ui-context.md` — no change; no new visible component or state (Decision 1).
- `database-schema.md` — no change; nothing here touches persistence.
- `code-standards.md` — no new naming convention introduced.
