# Spec 26 — Conversational intents UI

## Status: IMPLEMENTED AND VERIFIED (2026-09-04, same-session follow-up to Spec 25)

Spec 25's own Status/Verify checklist flagged this explicitly: "This spec alone does not fix the live app" — `ChatThread.tsx`'s client-side response re-validation only recognized 4 response shapes, so a real `ConversationalResponseSchema` reply (backend-verified correct via curl) failed client-side validation and rendered the generic `ErrorState` instead. The project owner hit this live within the same session ("Something went wrong. Please try again." after typing "Hey Beca") — a real, reproduced instance of the exact gap Spec 25 had already named, not a new bug. This spec closes it, the second and final unit of the conversational-intents work, matching the precedent Specs 17→18, 23→24 already set (backend spec, then a UI-only follow-up).

## Depends on

Spec 25 (the response shape and fixed copy this renders — unmodified here).

## Goal

`ChatThread.tsx` recognizes and renders `ConversationalResponseSchema` the same way it already renders the other four response shapes: a 5-way client-side re-validation check, a `ChatTurn` union member, a small dedicated presentational component, and `toConversationTurn` support so a conversational turn still contributes correctly to `recentHistory` (Spec 23/24).

## Decisions

1. **A new component, `ConversationalReplyBubble.tsx`, not a `MessageBubble` variant.** Matches the precedent `ClarificationCard`/`ServiceResultsCard` already set ("a state with its own meaning gets its own component") rather than reusing `EscalationCard`'s. `MessageBubble` is typed tightly against `ChatResponse` (Spec 07 Decision 5 — rendering is derived from `response.grounded` so it can never disagree with the data it's given) and has no field to key off here: `ConversationalResponseSchema` deliberately carries no `grounded`/`citations`/`simple_version`/`pidgin_version` (Spec 25 Decision 4), so it doesn't fit that component's contract.

2. **Styled as a plain, solid assistant bubble — not `MessageBubble`'s dashed/italic "we don't know" treatment.** A greeting or thank-you is a successful interaction, not a refusal; using the `grounded: false` visual (dashed border, italic, muted) would misrepresent it the same way it would have misrepresented a `NO_GROUNDED_INFO_MESSAGE`-style answer as "the model succeeded." Deliberately calmer/simpler than `ClarificationCard`/`ServiceResultsCard` too (no icon, no `role="status"`, no heading label) — this is ordinary conversation, not a distinct app state that needs to visually announce itself the way a clarification prompt or a service-results list does.

3. **Discriminant order: `conversational` checked last, immediately before the default `ChatResponse` fallback** — matches `lib/ai/schema.ts`'s own field order (`escalated` → `needs_clarification` → `service_navigation` → `conversational`) and every existing 4-way check already established (Spec 18 Decision 5, extended 2026-08-28). Applied identically in three places: the `ChatTurn` union, the client-side `safeParse` chain, and the per-turn JSX render branch.

4. **`toConversationTurn` gains a `conversational` branch (`turn.message`), so a conversational turn still contributes to `recentHistory` (Spec 23/24) like every other turn type already does** — Spec 24 Decision 6 already established that `getRecentHistory` runs over every turn type without filtering, on the reasoning that the resolver is trusted to judge relevance itself; a conversational turn is real conversational context, not excluded here either.

## Scope

**In scope:**

- `components/chat/ConversationalReplyBubble.tsx` (new)
- `components/chat/ChatThread.tsx` — `ChatTurn` union, `toConversationTurn`, the `safeParse` discriminant chain, the per-turn render branch

**Out of scope:** Spec 27 (personalization via `recentHistory` in `generateAnswer`) — unaffected by and independent of this change.

## Files to create / modify

- `components/chat/ConversationalReplyBubble.tsx` (new)
- `components/chat/ChatThread.tsx`

## Steps (as actually implemented)

1. Added `ConversationalReplyBubble.tsx` per Decisions 1–2.
2. Extended `ChatThread.tsx`'s `ChatTurn` union with the fifth assistant member.
3. Extended `toConversationTurn` with the `conversational` branch (Decision 4).
4. Extended the client-side `safeParse` discriminant chain to 5-way (Decision 3).
5. Extended the per-turn JSX render branch to 5-way (Decision 3).
6. Verified: `npx tsc --noEmit` and `npm run lint` both clean; the already-running dev server (Turbopack, hot-reload) picked up the change; re-confirmed the backend API response shape is unchanged (a live curl of "Hey Beca" still returns the identical `conversational: true` payload Spec 25 verified).
7. Updated `progress-tracker.md`, `architecture.md`, `ui-context.md`, and this file.

## New dependencies

None.

## Verify checklist

- [x] `ConversationalReplyBubble.tsx` created, matches the established small-dedicated-component pattern
- [x] `ChatThread.tsx`'s `ChatTurn` union, `safeParse` chain, `toConversationTurn`, and render branch all extended to 5-way, in the same discriminant order `lib/ai/schema.ts` documents
- [x] `npx tsc --noEmit` clean, `npm run lint` clean
- [x] Backend API contract reconfirmed unchanged (curl) — this spec touches no server code
- [ ] **Real browser verification of the actual reported repro — not done this pass, no browser available in this session, flagged rather than assumed.** The project owner hit the bug in their own browser; fixing the client-side validation/render logic is code-reviewed correct and traced by hand against the exact `ZodError` they reported (every missing/mismatched field in that error — `conversational`, `grounded`, `answer`, `citations`, `simple_version`, `pidgin_version` — is exactly what the new 5-way check now resolves correctly before falling through to `ChatResponseSchema`), but seeing the actual greeting bubble render in a live browser after this fix is the project owner's to confirm. Same verification-gap standard this project has applied to every prior UI-only change (Specs 07, 09, 12, 18, 24) — flagged explicitly, not assumed to pass.

## Docs to update after this spec

`progress-tracker.md` (mark complete); `architecture.md` (Spec 25's entry updated to drop the "backend only" qualifier); `ui-context.md` (Component specs section gains a bullet, matching Spec 18/20's own precedent for adding one when a new component ships).
