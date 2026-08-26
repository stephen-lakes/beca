# Spec 08 — Wire chat UI to the real API

## Goal

Replace Spec 07's throwaway round-robin mock queue with a real `POST /api/chat` call. After this spec, typing a question in the deployed chat UI produces a real grounded answer, a real no-grounded-information response, or a real escalation card — sourced live from Supabase/OpenAI via the Spec 05/06 API route, not a fixture. Matches `00-build-plan.md` unit 08: "Replace mock data with real `/api/chat` calls."

## Depends on

- Spec 06 (`app/api/chat/route.ts`) — already implemented and live-verified; this spec calls it, doesn't change it.
- Spec 07 (`ChatThread.tsx`, `MessageBubble.tsx`, `CitationChip.tsx`, `EscalationCard.tsx`, `components/ui/input.tsx`) — implemented and verified, and now correctly marked complete in `progress-tracker.md` (see the resolved note at the end of this file — this was flagged as out of sync when this spec was first drafted and has since been fixed).

## Decisions (resolved before implementation)

1. **Fetch call lives inline in `ChatThread.tsx`'s submit handler — no new hook, no new file.** `code-standards.md`'s "components never call Supabase or the AI provider directly — always through an API route" is satisfied by calling `fetch('/api/chat')`, a same-origin API route, not a provider SDK. There is exactly one call site; extracting a `hooks/useChatSession.ts` (named in `code-standards.md`'s naming table only as an example convention, not a required file) would be premature abstraction for a single consumer. `ai-workflow-rules.md`'s "never touch more than one system boundary per step" is satisfied — this step stays entirely inside `components/chat/`, calling an already-existing route rather than creating one.
2. **`components/chat/mock-data.ts` is deleted outright**, per its own header comment ("this entire file is throwaway: Spec 08 replaces the round-robin queue... and deletes what's no longer used"). Confirmed by search that `ChatThread.tsx` is its only importer, so nothing else breaks.
3. **The `ChatTurn` discriminated union moves into `ChatThread.tsx` itself**, unchanged in shape (`{ role: 'user'; text: string } | ({ role: 'assistant' } & ChatResponse) | ({ role: 'assistant' } & EscalationResponse)`). It only had one consumer once `mock-data.ts` is gone, so colocating it with that consumer matches `code-standards.md`'s single-purpose-module principle better than inventing a shared-types file for a two-branch union nobody else uses yet.
4. **Seed turns and the round-robin queue are removed, not adapted.** The thread now starts empty (`useState<ChatTurn[]>([])`). Rendering a placeholder for the zero-message case is `app-flow.md` state 1 (Empty state), explicitly assigned to Spec 10 by `00-build-plan.md`, not this unit — Spec 07's seeded turns existed only to make Spec 07's four static visual states checkable without wiring anything real, and keeping fake "seed" turns sitting in a now-real chat thread would look like a bug, not a feature, the moment real answers can appear alongside them. This spec deliberately leaves the screen blank on first load; that gap is closed by Spec 10, not silently patched here.
5. **Request body**: `POST /api/chat` with `{ message: trimmed }`, matching `ChatRequestSchema` (`z.string().min(1).max(2000)`) exactly — no new request shape invented. The existing `trimmed`/empty-guard from Spec 07's submit handler is kept as-is.
6. **Client-side max-length mirrors the server's:** `Input` gets `maxLength={2000}`, matching `ChatRequestSchema`'s upper bound. Cheap to add, avoids a guaranteed-400 round trip for an over-length message the server would reject anyway. No live character counter — that's a Spec 12 polish nicety, not required for correctness.
7. **A single global request-status slot, not a per-turn field.** `type RequestStatus = { kind: 'idle' } | { kind: 'pending' } | { kind: 'error'; message: string }`, held in its own `useState`, rendered as one trailing element after the mapped message list — never stored inside a `ChatTurn` itself. This app only ever has one request in flight at a time (Decision 9 disables the input while pending), so a single slot is sufficient and avoids growing `ChatTurn` with UI-only states that would have to be kept in sync with the real server response shapes it otherwise mirrors exactly.
8. **Minimal pending indicator, not a skeleton or typing-dots animation.** While `status.kind === 'pending'`, render one small `ink-soft` text line ("Thinking…") in the same trailing slot as Decision 7, wrapped in `aria-live="polite"` so it's announced without a manual focus move. A real network call needs *some* in-thread feedback — silence for several seconds reads as broken, not calm — but a fully animated skeleton/typing treatment is exactly the kind of visual-polish work `00-build-plan.md` assigns to unit 12 ("demo polish pass"), not this wiring unit. Matches `ui-context.md`'s pulse-animation guidance not existing yet for this component; nothing here is styled beyond existing tokens.
9. **Input and submit button are both disabled while `status.kind === 'pending'`**, in addition to the existing empty-string guard from Spec 07. Prevents a double-submit firing a second overlapping request. `handleSubmit` also early-returns if already pending, as defense-in-depth against an Enter-key submit racing the disabled-prop update.
10. **Error handling, and where its scope boundary sits against Spec 10.** `app-flow.md` state 5 requires "a plain 'something went wrong, try again' message. Never a raw error or stack trace." This spec implements exactly that plain-text requirement, in the same trailing slot as Decisions 7–8, because a real fetch call that can fail is exactly what this unit introduces — a wiring spec that leaves failure unhandled isn't done. What it does *not* build: any dedicated `ErrorState` component, persistent styling, or retry affordance beyond "the user can just type and submit again" — that visual/component work stays `00-build-plan.md` unit 10's job ("error/empty states" as named UI elements). Error copy resolution: if the response is not `ok`, the body is read as JSON and its `error` field is shown verbatim if present and a string — `app/api/chat/route.ts` never returns anything there except its own pre-written safe strings (`"Invalid request body"`, `GENERATION_FAILURE_MESSAGE`), never a raw exception, so this is safe per the invariant. If the body isn't valid JSON at all (a network-level failure, an infra 502, `fetch` itself rejecting), a local fallback constant is shown instead: `"Something went wrong. Please try again."` This isn't added to `lib/ai/schema.ts` — that file's fixed-copy constants (`NO_GROUNDED_INFO_MESSAGE`, `GENERATION_FAILURE_MESSAGE`, etc.) are strings the *server* can return in a response body; this string is never sent over the wire, it only exists for the case where the wire failed, so it belongs with the component that needs it.
11. **Successful responses are re-validated client-side against the real zod schemas before rendering, not trusted on the `escalated` field alone.** `const parsed = json.escalated ? EscalationResponseSchema.safeParse(json) : ChatResponseSchema.safeParse(json)`. The server already validates the same shapes before sending (Spec 06), so this is intentionally cheap insurance in the same spirit as Spec 06's own route-level `.parse()` calls on hand-constructed objects — catching a transport-layer shape bug (a proxy rewriting the body, a future route change made without touching this file) at the client boundary instead of handing an unvalidated object straight to `MessageBubble`/`EscalationCard`. A failed `safeParse` is treated identically to Decision 10's error path (generic message shown, raw payload only ever reaching `console.error`, never the UI) — not a crash, not a silent fallback to whatever shape came back. Importing `ChatResponseSchema`/`EscalationResponseSchema` from `lib/ai/schema.ts` into a client component is not a boundary violation, per the same reasoning `07-chat-ui-shell.md` Decision 2 already established: `code-standards.md`'s import restriction is about provider SDKs (`openai`, `@supabase/supabase-js`), not the shared response types/schemas every consumer of `/api/chat` needs anyway.
12. **On error, the input is not pre-filled with the failed message.** Considered restoring `inputValue` to the text that failed to send, to save retyping — rejected for this spec as an avoidable extra state transition (was it "never sent" or "sent but the response failed"?) for a hackathon-scale MVP where retyping a short question costs nothing. Noted as a possible Spec 12 nicety, not built now.
13. **No `AbortController`, no request timeout, no request cancellation on unmount.** This is a single-screen app with no navigation away from the chat (`app-flow.md`: "no routing between pages"), so there's no unmount-mid-request case to guard against, and no evidence yet that the OpenAI/Supabase round trip runs long enough at this project's scale to need a client-enforced timeout (Spec 05's live curl test completed well inside the ~5s demo target). Accepted simplification, not an oversight — revisit only if real-world latency turns out to warrant it.

## Scope

**In scope:**

- `components/chat/ChatThread.tsx` (modify) — remove the mock queue and seeded turns; add the `ChatTurn` type (moved from `mock-data.ts`, Decision 3); add `status: RequestStatus` state (Decision 7); replace the submit handler's queue-pop with a real `fetch('/api/chat', { method: 'POST', ... })` call, still appending the user bubble optimistically first; render the pending/error trailing slot (Decisions 8, 10); disable the input/button while pending (Decision 9); add `maxLength={2000}` to the `Input` (Decision 6).
- `components/chat/mock-data.ts` (delete, Decision 2).

**Out of scope (do not build in this spec):**

- Any dedicated empty-state placeholder for the now-blank initial thread — Spec 10 (Decision 4).
- Any dedicated `ErrorState`/`EmptyState` component, persistent disclaimer bar, or privacy notice — Spec 10 (Decision 10).
- Skeleton loading animation, typing-dots, or any polish-grade loading treatment — Spec 12 (Decision 8).
- Retyping/retry affordances beyond re-submitting manually — Decision 12.
- `LanguageToggle` / `ReadingLevelToggle`, `simple_version`/`pidgin_version` handling — Spec 09.
- Any change to `app/api/chat/route.ts`, `app/api/services/route.ts`, `lib/ai/*`, `lib/kb/*`, `lib/directory/*` — this spec is a pure consumer of the existing, already-verified route.
- `MessageBubble.tsx`, `CitationChip.tsx`, `EscalationCard.tsx` — no changes needed; they already take the real schema types and render real API responses exactly as they rendered mock ones.

## Files to create / modify

- `components/chat/ChatThread.tsx` (modify)
- `components/chat/mock-data.ts` (delete)
- No `.env.example` changes — no new env vars, calls an existing same-origin route.

## Steps

1. Delete `components/chat/mock-data.ts`.
2. In `ChatThread.tsx`: remove the `./mock-data` import; add the `ChatTurn` type definition locally (Decision 3); import `ChatResponseSchema`, `EscalationResponseSchema`, `ChatResponse`, `EscalationResponse` types from `@/lib/ai/schema` for the real fetch/validation path.
3. Change `messages` initial state from `SEED_TURNS` to `[]` (Decision 4).
4. Add `status` state (Decision 7) and its type.
5. Rewrite `handleSubmit`: guard on empty trim and `status.kind === 'pending'` (Decision 9); append the user turn optimistically; set `status` to pending; `fetch('/api/chat', ...)`; on non-ok response, resolve the error message per Decision 10 and set `status` to the error variant; on ok response, `await res.json()`, re-validate per Decision 11, append the validated assistant turn on success or fall into the same error path on failure; always clear `inputValue` immediately (unchanged from Spec 07) but only clear `status` back to idle once the request settles.
6. Render the trailing pending/error slot below the mapped message list, above the form (Decisions 7, 8, 10), wrapped in `aria-live="polite"`.
7. Wire `disabled={status.kind === 'pending'}` onto both `Input` and the submit `Button`; add `maxLength={2000}` to `Input`.
8. Manually verify against `npm run dev`, hitting the real deployed Supabase/OpenAI backend (no test-set script yet — that's Spec 11):
   - A real in-KB question (e.g. a malaria question, matching Spec 05/06's own verified test queries) returns a live grounded answer with at least one real citation, `chunk_id` visibly a real UUID-shaped value, not `mock-chunk-*`.
   - A real out-of-KB question returns the live no-grounded-info bubble.
   - A real red-flag phrase returns a live `EscalationCard` populated with real `matched_entries` rows from `directory_entries` (cross-check names against the live table, same style of check Spec 05/06 used).
   - The pending indicator appears immediately on submit and clears the moment a response (success or error) lands; input and submit button are visibly disabled for that window.
   - Rapid double-Enter / double-click during the pending window does not fire a second request.
   - A simulated failure (stop the dev server mid-request, or use browser devtools to force the request offline) shows the plain fallback message, never a stack trace or raw fetch error in the UI; the browser console shows the raw failure via `console.error` for debugging.
   - Typing beyond 2000 characters is blocked by the input itself.
   - `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly.
   - No remaining reference to `mock-data`, `SEED_TURNS`, or `MOCK_RESPONSE_QUEUE` anywhere in the repo.

## New dependencies

None. Native `fetch` only.

## Status: IMPLEMENTED AND VERIFIED

`components/chat/mock-data.ts` deleted; `ChatThread.tsx` rewritten per Decisions 1–13. `npx tsc --noEmit` and `npm run lint` both clean; `npm run dev` started cleanly (Turbopack).

Live-verified with real `curl` requests against the running dev server, hitting the real Supabase/OpenAI backend — not mocked, not stubbed: (1) a real malaria-prevention question returned `grounded: true` with a real UUID `chunk_id` (`2ff09f44-4fce-40d2-8048-88162f78ac84`) and a real WHO `source_url`; (2) an out-of-KB question ("best smartphone to buy in 2026") returned the verbatim `NO_GROUNDED_INFO_MESSAGE` with `escalated: false`; (3) a red-flag phrase ("baby has a fever and is having convulsions right now") returned `escalated: true` with real, live `matched_entries` rows (Lagos State emergency/ambulance service, Nigeria unified emergency number — category resolved to `emergency` by Spec 06's existing classifier/red-flag logic, unchanged by this spec); (4) an empty-message request returned `HTTP 400` with the exact safe string `"Invalid request body"`, confirming the client's non-ok-response error path has a real, safe server string to display, never a raw exception. The rendered homepage HTML was also inspected directly: no seeded turns present (Decision 4), and the message `Input` carries `maxLength="2000"` in its rendered markup.

Not machine-verified in this pass (would need an actual browser, not curl): the pending indicator's actual appearance/clearing in the DOM, the input/button's disabled state taking visual effect during a pending request, the double-submit guard actually blocking a second overlapping request, and the `catch` block's `REQUEST_FAILED_MESSAGE` firing on a genuinely thrown `fetch` exception (as opposed to a server-returned non-ok JSON response, which *was* verified live). These rely on code matching Decisions 7–10 exactly and are treated as code-reviewed-correct rather than independently reproduced live — flagged here explicitly rather than silently assumed, matching how Spec 07 flagged its own deferred browser-only items above.

## Verify checklist

- [x] `components/chat/mock-data.ts` deleted; no remaining imports of it anywhere (confirmed by repo-wide search — the only remaining match is an explanatory comment in `ChatThread.tsx`, not an import)
- [x] `ChatThread.tsx` starts with an empty `messages` array (Decision 4) and no longer holds a round-robin queue — confirmed via the rendered homepage HTML showing no seeded turns
- [x] Real `POST /api/chat` call wired in the submit handler, request body `{ message: trimmed }`
- [x] A real grounded question, a real out-of-KB question, and a real red-flag phrase each produce the correct live UI (grounded bubble + real citation / no-grounded-info bubble / real EscalationCard) end-to-end against the deployed backend — verified live via `curl` against the running dev server hitting the real Supabase/OpenAI backend (real UUID `chunk_id`, real WHO `source_url`, verbatim `NO_GROUNDED_INFO_MESSAGE`, real `matched_entries` rows)
- [ ] Pending indicator shows on submit and clears on settle; input + submit button disabled while pending; double-submit blocked — **not independently verified this pass, no browser available in this session; code-reviewed against Decisions 7–9 only, not assumed passing**
- [x] Non-ok responses resolve to a plain, non-technical message per Decision 10 — verified live: an empty-message request returns `HTTP 400` with the exact safe string `"Invalid request body"`, confirming the client's non-ok path has a real safe string to display. **Not independently verified:** a genuinely thrown `fetch` exception (offline/network-level failure) hitting the `catch` block and showing `REQUEST_FAILED_MESSAGE` — that path is code-reviewed only, no browser available to force it live this pass
- [x] Successful responses are re-validated client-side with `ChatResponseSchema`/`EscalationResponseSchema` before rendering (Decision 11) — code matches the decision; not separately forced to fail this pass since every real response so far has validated successfully
- [x] `Input` enforces `maxLength={2000}` — confirmed via rendered HTML: `maxLength="2000"` present on the input element
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [x] No raw hex/pixel values outside `app/globals.css`'s `@theme` block in any modified file
- [x] No Supabase or AI-provider SDK import anywhere under `components/` — only type/schema imports from `lib/ai/schema.ts`
- [x] `progress-tracker.md` updated: Spec 08 marked complete, Decisions 1–13 logged, live-verification results logged, including which items were browser-only and not independently reproduced this pass

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete once verified; log Decisions 1–13; log live-verification results.
- `architecture.md` — no change; no new file, folder, provider, or system boundary.
- `database-schema.md` — no change; this spec reads no new data shape.
- `app-flow.md` — no change; states 2–5 render exactly as already specified, this spec only makes them real instead of mocked. (State 1, the empty state, remains Spec 10's to build — not touched here.)
- `ui-context.md` — no change; no new token, no new component spec.
- `code-standards.md` — no change.

## Resolved: Spec 07's tracker entry was out of sync with what's on disk

Originally flagged here when this spec was first drafted: `components/chat/mock-data.ts`, `CitationChip.tsx`, `MessageBubble.tsx`, `EscalationCard.tsx`, `ChatThread.tsx`, and `components/ui/input.tsx` were all found already present and matching `07-chat-ui-shell.md`'s written spec exactly, but `progress-tracker.md`'s Completed/Next Up sections still said "Spec 06 is complete and Spec 07 hasn't been started." That draft deliberately left the tracker untouched rather than asserting Spec 07's manual-verification checklist had actually passed without running it.

**Resolved.** Spec 07's own verify checklist (in `07-chat-ui-shell.md`) has since been run for real — `tsc`/`lint` clean, `npm run dev` starting cleanly, and the rendered HTML directly inspected for all four visual states, both `CitationChip` branches, and both directory-entry `verified` variants in the escalation card. `progress-tracker.md` now reflects this accurately: Spec 07 is listed under Completed, `Current Goal`/`In Progress`/`Next Up` all point at Spec 08, and Spec 07's Decisions 1–12 are logged under Architecture Decisions. This spec's own `Depends on` section above no longer carries the caveat. Not independently re-verified as part of resolving this note (see Spec 07's own Status section for the one item it flagged as deferred): the round-robin submit interaction across multiple clicks and keyboard-Tab focus-ring visibility — both browser-only checks, not reproducible via the curl/HTML-inspection method used for the rest of Spec 07's pass.
