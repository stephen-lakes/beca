# Spec 18 — Multi-turn triage clarification — UI

## Status: IMPLEMENTED

Drafted and shown to the project owner before any code was touched (same pattern as Spec 17). Implemented after explicit go-ahead ("implement"), taken as approval of Decision 2's ⚠️-flagged visual design as drafted, without edits. Both files written/modified as scoped: `components/chat/ClarificationCard.tsx` (new), `components/chat/ChatThread.tsx` (modified per Decisions 3–9). `context/architecture.md` and `context/ui-context.md` updated per the Docs-to-update list. `npx tsc --noEmit` and `npm run lint` both clean.

**Verification scope for this pass:** the backend contract this UI renders against (Spec 17's `ClarificationResponseSchema`/`priorClarification`) was already live-verified end-to-end via curl in Spec 17's own pass — that isn't re-proven here. This spec is a pure client-side rendering/wiring change with no server code touched, and this session has no browser available, so verification here is: (1) `tsc`/`lint` clean against the full 3-way discriminated-union typing (`ChatTurn`, the re-validation branch, the render branch, `getPriorClarification`'s return type all type-check correctly against the real `lib/ai/schema.ts` types, not hand-waved); (2) a real `npm run dev` smoke test — `GET /` returns `HTTP 200` with no compile or render error in the server log, confirming the new component and the extended `ChatThread.tsx` logic build and mount cleanly. The actual interactive round-trip (typing a reply, seeing `ClarificationCard` render, confirming the retry path preserves `lastPriorClarification` through a real failure) is **not independently verified this pass** — it needs a real browser, the same category of gap Specs 07/09 both flagged explicitly for their own interactive/visual claims rather than assumed passing. Code-reviewed against the written decisions instead: `getPriorClarification`'s logic was traced by hand against the exact append order `handleSubmit`/`requestAnswer` use (user turn appended, then request sent, then assistant turn appended on success) to confirm the "before append" contract in Decision 7's comment actually holds at its one call site.

## Goal

Render the Clarification state (`app-flow.md` state 6) distinctly from both a normal answer bubble and the escalation card, and wire the user's follow-up reply into the existing chat input so it reaches `/api/chat` with the `priorClarification` context Spec 17's API already expects — closing the live UX gap Spec 17's own Completed entry flagged (`progress-tracker.md`). Matches `00-build-plan.md` unit 18: "Render the clarification state distinctly in `ChatThread`/`MessageBubble`... wire the follow-up reply into the existing chat input, no new input mechanism."

## Depends on

- Spec 17 (multi-turn triage clarification — classifier) — done, live-verified. This spec renders `ClarificationResponseSchema` and sends `PriorClarificationSchema`, both already shipped in `lib/ai/schema.ts`; no backend change is needed or made here.
- Spec 07 (chat UI shell), Spec 08 (real API wiring), Spec 09 (toggles), Spec 10 (error/empty states) — all done. This spec modifies the same `components/chat/ChatThread.tsx` those specs built and extended, following the exact same append/re-validate/retry pattern rather than introducing a new one.

## Decisions (resolved before implementation)

Decision 2's ⚠️-flagged visual design was shown to the project owner in draft form and approved without edits when implementation was authorized.

1. **New component: `ClarificationCard.tsx`, not a `MessageBubble` variant.** `app-flow.md` state 6 is explicit: rendered distinctly from both a normal answer bubble and the escalation card — not two-way distinct, three-way. This mirrors the exact precedent `EscalationCard` already set (Spec 07 Decision 6: "a separate component from `MessageBubble`, never a bubble variant") for the same underlying reason: a state with its own meaning and its own required visual treatment gets its own component, not a conditional inside a general-purpose one.
2. **⚠️ Needs sign-off — visual design.** `ui-context.md`'s Component specs section has no existing entry for a clarification state to implement against. Proposed design, reusing only existing tokens (no new hex value, per hard invariant 2 in both `architecture.md` and `code-standards.md`):
   - Bubble-width, not full-width — `max-w-[80%] justify-start`, the same footprint as a normal assistant `MessageBubble`, not `EscalationCard`'s full-width treatment. Reasoning: this state carries no safety alarm, and `ui-context.md`'s "unmistakable visual break" language is reserved for escalation specifically ("the single highest-value asset in the build") — giving Clarification the same visual weight would dilute that contrast, the same concern Spec 12 Decision 3 raised when deciding *against* severity-tiered escalation styling.
   - `border-brand bg-brand/5` (soft teal tint) instead of `MessageBubble`'s neutral `border-line bg-card` (grounded) or dashed `border-line bg-paper` (no-grounded-info) — visually distinct from both existing bubble treatments at a glance, using the existing `brand` token rather than introducing a new one.
   - A `HelpCircle` icon (`lucide-react`, already a dependency) in `text-brand`, paired with a short label — proposed copy: **"A couple of quick questions"** — then each question rendered as its own line (1–2 items, per `ClarificationResponseSchema`).
   - `role="status"` (not `role="alert"`, which `EscalationCard` already uses) — ARIA's implicit-live-region semantics for `status` are polite, not assertive, matching that this is routine triage back-and-forth, not an emergency notice.
   - If approved, `ui-context.md`'s Component specs section gains a "Clarification card" entry describing this, the same way `EscalationCard`'s entry already exists there — see Docs to update.
3. **`ChatTurn` (in `ChatThread.tsx`) gains a third assistant member: `({ role: "assistant" } & ClarificationResponse)`.** Alongside the existing `ChatResponse`/`EscalationResponse` members. All three now carry `needs_clarification` as a distinct literal (`false`/`false`/`true` respectively — Spec 17), so the per-turn render branch narrows on it directly, the same way it already narrows on `escalated`.
4. **Per-turn render branch, in order: user → `escalated` → `needs_clarification` → plain `MessageBubble`.** Matches `lib/ai/schema.ts`'s own documented discriminant order (Spec 17 Decision 3: "client checks `escalated` first, then `needs_clarification`") — `EscalationResponseSchema` and `ClarificationResponseSchema` both carry `escalated: false`/`needs_clarification: false` pairs in a way that makes the two checks mutually exclusive by construction, so checking `escalated` first is safe and doesn't require also checking `needs_clarification` is false before falling through.
5. **Client-side response re-validation (Spec 08 Decision 11) extended from a 2-way to a 3-way check**, same discriminant order as Decision 4: `json.escalated ? EscalationResponseSchema.safeParse(json) : json.needs_clarification ? ClarificationResponseSchema.safeParse(json) : ChatResponseSchema.safeParse(json)`.
6. **No new input mechanism — the existing `<Input>`/submit `<Button>`/`handleSubmit` flow answers a clarification exactly the way it asks any other question.** The user's reply is typed into the same field and submitted the same way; nothing in the UI requires the reply to literally answer the posed question(s) — the classifier interprets whatever combined context it receives (`app-flow.md` Journey 4), matching how a real conversation actually works. Placeholder text and button copy are unchanged while a clarification is pending — a contextual "answering mode" label was considered and declined, to keep this spec's diff to exactly what `00-build-plan.md` unit 18 scopes ("no new input mechanism") rather than adding a new UI-copy surface that isn't required by anything in `app-flow.md` or `ui-context.md`.
7. **`priorClarification` is derived from existing thread state, not new persisted state, via a `getPriorClarification(messages)` helper.** Reads the current `messages` array immediately before a new user turn is appended: if the last entry is an assistant turn with `needs_clarification === true`, the entry before it is guaranteed to be the user turn that triggered it (this component's own invariant — every assistant append is immediately preceded by exactly one new user append, never two consecutive assistant turns), so `{ originalMessage: precedingUserTurn.text, questionsAsked: lastTurn.questions }` is returned; otherwise `null`. No new persistence anywhere, no server-side session — matches Spec 17 Decision 1's stateless design, the client is simply supplying back what it already rendered.
8. **`lastPriorClarification` state added alongside the existing `lastMessage` state (Spec 10 Decision 8), for the same reason.** `getPriorClarification()` can only be correctly computed from `messages` *before* the new user turn is optimistically appended — but `ErrorState`'s "Try again" button calls `requestAnswer` again later, after that append already happened and (on a real network failure) possibly after further re-renders. Recomputing it at retry time from the now-different tail of `messages` would silently lose the clarification context on exactly the turn where losing it matters most. Instead, `handleSubmit` computes it once, stores it in `lastPriorClarification`, and both the initial call and the retry call read from that stored value — mirroring `lastMessage`'s existing role exactly.
9. **`requestAnswer(message, priorClarification)` gains a second parameter**, threaded straight into the POST body (`JSON.stringify({ message, priorClarification })`) — Spec 17's `ChatRequestSchema` already accepts this field as `nullable().optional()`, so sending an explicit `null` on every non-clarification turn is valid and simplest (no conditional key omission needed).
10. **The one-round cap is entirely server-enforced (Spec 17 Decision 4) — no client-side round tracking is added.** The UI never needs to know whether a given request is "the final round"; it always sends whatever `priorClarification` `getPriorClarification()` derives from the thread, and the server guarantees the response is never `needs_clarification: true` again once a request already carried it. Adding a client-side cap-check would be redundant defensive logic duplicating a guarantee the server already makes — the same "don't duplicate a server-side invariant in the client" restraint Spec 08 showed by not re-implementing citation-chunk validation client-side.

## Scope

**In scope:**

- `components/chat/ClarificationCard.tsx` (new) — renders one `ClarificationResponse` turn: icon + label + the 1–2 questions, per Decisions 1–2.
- `components/chat/ChatThread.tsx` (modify):
  - `ChatTurn` type extended (Decision 3).
  - New `getPriorClarification(messages: ChatTurn[]): PriorClarification | null` helper (Decision 7).
  - New `lastPriorClarification` state (Decision 8).
  - `requestAnswer()` signature and POST body extended (Decision 9); re-validation branch extended to 3-way (Decision 5).
  - `handleSubmit()` computes and stores `priorClarification` before appending the new user turn (Decisions 7–8).
  - Per-turn render branch extended to 3-way (Decision 4).
  - `ErrorState`'s `onRetry` call site updated to pass `lastPriorClarification` alongside `lastMessage`.

**Out of scope (do not build in this spec):**

- Any Simple-language/Pidgin toggle on `ClarificationCard` — same reasoning Spec 09 Decision 1 already applied to `EscalationCard`: this is fixed-shape, safety-adjacent triage copy sourced from the classifier's own judgment call, not a `ChatResponseSchema` grounded answer, so it's not in the toggle system's scope. Not tracked as a new Open Question — it's the same already-settled reasoning, not a new gap.
- Any change to `lib/ai/schema.ts`, `lib/ai/prompts.ts`, `lib/ai/classify.ts`, or `app/api/chat/route.ts` — Spec 17 already shipped and live-verified everything this spec's UI reads from and writes to.
- A client-side clarification-round counter or cap check — Decision 10.
- A contextual "answering a clarification" input placeholder/copy variant — considered and declined in Decision 6.
- Any change to `EmptyState.tsx`, `DisclaimerBar.tsx`, or `MessageBubble.tsx`'s existing grounded/no-grounded rendering — untouched.

## Files to create / modify

- `components/chat/ClarificationCard.tsx` (new)
- `components/chat/ChatThread.tsx` (modify)
- `context/architecture.md` (modify) — `components/chat/` folder-structure comment gains `ClarificationCard`, the same kind of update Spec 10 made for its own three then-unreserved component names.
- `context/ui-context.md` (modify, pending Decision 2's sign-off) — new "Clarification card" entry in Component specs.
- No `.env.example`, `lib/`, or `app/api/*` changes.

## Steps

1. Confirm Decision 2's visual design (or an amended version) with the project owner.
2. Write `components/chat/ClarificationCard.tsx` per Decisions 1–2.
3. Modify `components/chat/ChatThread.tsx` per Decisions 3–9: extend `ChatTurn`; add `getPriorClarification()`; add `lastPriorClarification` state; extend `requestAnswer()`'s signature, POST body, and re-validation branch; update `handleSubmit()`; extend the per-turn render branch; update the retry call site.
4. Update `context/architecture.md`'s `components/chat/` folder-structure comment.
5. Update `context/ui-context.md`'s Component specs section with the approved Clarification card entry.
6. Verify against `npm run dev`, hitting the real deployed Supabase/OpenAI backend (Spec 17 is live):
   - A genuinely ambiguous message renders `ClarificationCard` with the exact 1–2 questions the API returned, visually distinct at a glance from both a normal answer bubble and `EscalationCard` — never rendered as a plain chat bubble.
   - Typing a reply into the same input and submitting sends a request whose body carries a `priorClarification` with the correct `originalMessage`/`questionsAsked`, confirmed via the network tab (or a temporary log) — not a fresh `{ message }` request with the context silently dropped.
   - That reply resolves to either a normal answer bubble or `EscalationCard` — never a second `ClarificationCard` — for both an unambiguous-follow-up case and a still-ambiguous-follow-up case (the latter confirming the server-side round-cap override, Spec 17 Decision 4, actually reaches the UI correctly).
   - A simulated network failure on the reply step (e.g. devtools offline) followed by "Try again" resends with `priorClarification` intact — confirms Decision 8's `lastPriorClarification` state actually round-trips through a real error/retry cycle, not just a happy path.
   - An exact red-flag phrase on the very first message still renders `EscalationCard` immediately, with no `ClarificationCard` ever appearing — confirms this spec introduced no regression in the unchanged escalation/grounded/no-grounded-info paths.
   - `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly.

## New dependencies

None. `HelpCircle` comes from `lucide-react`, already a dependency (Spec 07 uses the same package for other icons).

## Verify checklist

- [x] `components/chat/ClarificationCard.tsx` written; `components/chat/ChatThread.tsx` modified per Decisions 3–9
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly — confirmed via a real `GET /` returning `HTTP 200` with no compile/render error in the dev server log
- [x] `ChatTurn`, the 3-way client-side re-validation branch, the 3-way render branch, and `getPriorClarification`'s return type all type-check correctly against the real `lib/ai/schema.ts` types (not stubbed/hand-waved) — enforced by `tsc`, not just eyeballed
- [x] `getPriorClarification`'s "called before the new user turn is appended" contract traced by hand against `handleSubmit`'s actual append order and confirmed correct at its one call site
- [x] `architecture.md`'s `components/chat/` folder comment and `ui-context.md`'s Component specs both updated
- [ ] **Not independently verified this pass — no browser available:** `ClarificationCard` actually rendering distinctly from a normal bubble and from `EscalationCard` in a live DOM; the reply round-trip actually sending `priorClarification` in the request body; the round-cap override reaching the UI as `EscalationCard` rather than a second `ClarificationCard`; the retry path actually preserving `lastPriorClarification` through a real network failure. Code-reviewed against the written decisions instead — see Status above.
- [x] `progress-tracker.md` updated: Spec 18 marked complete, Decisions 1–10 logged, the browser-dependent verification gap logged explicitly, Decision 2's sign-off logged as approved

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — marked complete; Decisions 1–10 logged; verification results (and the browser-dependent gap) logged; Decision 2's sign-off logged as approved.
- `architecture.md` — `components/chat/` folder-structure comment gains `ClarificationCard` (Decision 1) — done.
- `ui-context.md` — new "Clarification card" Component-specs entry (Decision 2) — done.
- `app-flow.md` — no change; state 6 and Journey 4 already describe exactly what this spec implements (added ahead of Spec 17, per `CLAUDE.md`'s doc-before-code rule).
- `database-schema.md` — no change; nothing here touches persistence.
- `code-standards.md` — no new naming convention introduced (`ClarificationCard.tsx` follows the existing PascalCase component-file convention already in the table).
