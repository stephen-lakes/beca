# Spec 10 — Disclaimer, privacy notice, error/empty states

## Goal

Add the three persistent UI elements `app-flow.md` and `ui-context.md` already call for but no prior spec built: a persistent disclaimer + privacy bar, a proper empty-state placeholder (closing the blank-screen gap Spec 08 deliberately left open), and a dedicated error-state treatment with a working retry — replacing Spec 08's bare inline error text. Matches `00-build-plan.md` unit 10: "Disclaimer, privacy notice, error/empty states — persistent UI elements from `app-flow.md`."

## Depends on

- Spec 07 (UI shell) — already implemented; this spec extends `ChatThread.tsx`'s layout and adds new sibling components under `components/chat/`.
- Spec 08 (real API wiring) — the error state this spec builds replaces Spec 08's minimal inline error text; the retry button calls the same request logic Spec 08 already wrote, refactored into a reusable function rather than duplicated.

## Found and fixed before drafting this spec's decisions

While reviewing what a privacy notice on screen would actually be promising, checked whether raw user message text is ever logged server-side — directly relevant, since `architecture.md` hard invariant 4 is unconditional: "No raw user message text is persisted beyond the current session." **It wasn't true.** `app/api/chat/route.ts` has three `console.error` call sites (from Specs 05/06) that log the raw `message` variable directly:

```
console.error("classifyUrgency failed after retry for message:", message)
console.error("Escalation branch entered without a resolvable category/severity for message:", message)
console.error("generateAnswer failed after retry for message:", message)
```

Server console output on a hosting platform (Vercel included) is typically retained — exactly the kind of persistence the invariant rules out with "no exceptions." This predates Spec 10 and isn't something a UI spec would normally touch, but it's fixed here rather than left in place, the same way Spec 05 and Spec 06/07 fixed bugs discovered mid-spec rather than quietly patching them or spinning up a separate spec number for one three-line fix: **all three call sites now log `message.length` instead of `message`** — preserves a little debugging signal (an oddly-shaped request is still visible) without logging the actual content. `lib/ai/classify.ts`'s and `lib/ai/client.ts`'s `console.error` calls were checked too — they log the caught `error` object, never the user's message text, so they're left as-is.

## Decisions (resolved before implementation)

1. **`DisclaimerBar` renders as `ChatThread.tsx`'s final flex item, below the input form — not above it, and not in `app/page.tsx`.** `ui-context.md`: "persistent across every screen state, `ink-soft` text, thin **top** border." A top border only reads as a separator if there's a screen element above it to separate from; placed at the very top of the page, there's nothing internal to separate it from. Placed as the bottom-most strip (below the input, which already has its own `border-t`), the border makes sense the way a "AI can make mistakes"-style caption sits under a chat input. Rendered inside `ChatThread.tsx` (not `app/page.tsx`) to keep one component owning the full screen's layout — the same reasoning Spec 07 Decision 3 used to make `ChatThread` the sole `'use client'` boundary.
2. **One component carries both the disclaimer and the privacy notice, not two.** `project-overview.md`'s Must-Have feature list has a single bullet — "Persistent disclaimer and privacy notice" — not two separate bullets; `ui-context.md`'s Component specs section only names one component, "Disclaimer bar." Two short lines inside one bar: a disclaimer sentence and a privacy sentence.
3. **Exact copy, matching what's actually true about the system:** Disclaimer — "This is general health information, not a diagnosis or treatment plan. Always see a qualified health worker for anything specific to you." Privacy — "No login. Nothing you type is saved after this session." The privacy line is only accurate because of the fix above — before it, "nothing you type is saved" would have been false the moment classification or generation failed.
4. **English only — no Simple/Pidgin toggle on the disclaimer bar.** Spec 09 scoped the toggle system to `ChatResponseSchema` answers specifically (Decision 1 there excluded the escalation card on the same reasoning: fixed safety-adjacent copy shouldn't get a hand-guessed translation without a review pass). The disclaimer bar is the same category of fixed copy. Tracked as an Open Question below, not silently decided as "never," and not guessed at now.
5. **`EmptyState` renders in the message-list area when `messages.length === 0`**, replacing the blank space Spec 08 Decision 4 deliberately left. Copy taken verbatim from `app-flow.md`'s own example rather than invented fresh: "Ask about vaccines, a clinic, or how to prepare for an appointment." Centered, `ink-soft` text, a neutral `lucide-react` icon (`MessageCircleQuestion` — already a dependency via `lucide-react`). No clickable "tap to fill the input" affordance on the sample questions — `app-flow.md` only calls for descriptive text ("a short prompt suggestion"), not an interactive chip; a tappable version is a reasonable Spec 12 polish nicety, not required here.
6. **`ErrorState` replaces Spec 08's bare inline `<p>{status.message}</p>`** with a proper component: an icon, the same safe message text Spec 08 already resolves (server's own `error` string, or the client-only `REQUEST_FAILED_MESSAGE` fallback — unchanged), and a "Try again" button.
7. **`ErrorState`'s icon is deliberately not `AlertTriangle`** (already used by `EscalationCard`) **and its styling uses only neutral tokens — never `urgent`/`urgent-soft`.** `ui-context.md` reserves those two tokens for the escalation card "never used for anything else," and separately requires "color is never the only signal for the escalation state." Both rules point the same direction from the other side: nothing else in the UI should borrow the escalation card's visual signature, or a real health escalation risks reading as just another error toast. `AlertCircle` (also `lucide-react`) is used instead, styled with `border-line`/`bg-card`/`text-ink`/`text-ink-soft` only.
8. **"Try again" resubmits the exact last message without duplicating the user bubble or requiring a retype.** The user bubble for the failed message is already visible in the thread (Spec 08 appends it optimistically before the fetch call) — retrying shouldn't add a second copy of it. `ChatThread.tsx`'s `handleSubmit` is refactored: the fetch/validate/append-or-error logic Spec 08 already wrote is extracted into a standalone `requestAnswer(message: string)`; `handleSubmit` appends the user bubble, records it in a new `lastMessage` state, then calls `requestAnswer`. The retry button calls `requestAnswer(lastMessage)` directly — no bubble append, no input-clearing (the input was already cleared at the original submit time).
9. **Spec 08's "Thinking…" pending indicator is untouched.** Loading-state visual polish is explicitly Spec 12's job (Spec 08 Decision 8) — this spec only replaces the *error* branch of the same trailing status slot, not the pending branch.
10. **`architecture.md`'s folder-structure listing is updated, not left stale.** Unlike Spec 07's and Spec 09's components, `EmptyState`, `ErrorState`, and `DisclaimerBar` were never pre-reserved names in `architecture.md`'s `components/chat/` line — this spec introduces them fresh, so the doc is updated as part of implementing this spec, per `CLAUDE.md`'s "if an architectural decision is needed... update the relevant context file first."
11. **No changes to `EscalationCard.tsx`.** It already carries its own inline disclaimer line (Spec 07 Decision 8) and is deliberately excluded from the toggle system (Spec 09 Decision 1) for the same fixed-safety-copy reasoning as Decision 4 above — this spec doesn't reopen that.

## Scope

**In scope:**

- `app/api/chat/route.ts` (modify) — the three `console.error` call sites now log `message.length` instead of `message` (Found-and-fixed above).
- `components/chat/DisclaimerBar.tsx` (new) — Decisions 1–4.
- `components/chat/EmptyState.tsx` (new) — Decision 5.
- `components/chat/ErrorState.tsx` (new) — Decisions 6–7.
- `components/chat/ChatThread.tsx` (modify) — renders `DisclaimerBar` as the final flex item; renders `EmptyState` when `messages.length === 0`; replaces the inline error `<p>` with `<ErrorState>`; refactors `handleSubmit` to extract `requestAnswer` and add `lastMessage` state (Decision 8).
- `architecture.md` (modify) — add `EmptyState, ErrorState, DisclaimerBar` to the `components/chat/` folder-structure listing (Decision 10).

**Out of scope (do not build in this spec):**

- Any Simple/Pidgin variant of the disclaimer bar's copy — Decision 4, tracked as an Open Question.
- Any change to the pending ("Thinking…") indicator or its styling — Decision 9, Spec 12's job.
- A clickable/tap-to-fill version of the empty state's sample question — Decision 5, a possible Spec 12 nicety.
- Any change to `EscalationCard.tsx` — Decision 11.
- Any change to `lib/ai/classify.ts` or `lib/ai/client.ts`'s own `console.error` calls — checked, found to already log only the caught error object, not user message text; left as-is.
- A dedicated privacy-policy page or modal — the Must-Have feature list calls for a persistent notice, not a full policy document; out of scope for this project entirely (no user accounts, no data retention to document beyond what the one-line notice already states).

## Files to create / modify

- `app/api/chat/route.ts` (modify)
- `components/chat/DisclaimerBar.tsx` (new)
- `components/chat/EmptyState.tsx` (new)
- `components/chat/ErrorState.tsx` (new)
- `components/chat/ChatThread.tsx` (modify)
- `architecture.md` (modify)
- No `.env.example` changes.

## Steps

1. In `app/api/chat/route.ts`: replace `message` with `message.length` in the three `console.error` calls identified above.
2. Write `components/chat/DisclaimerBar.tsx` (Decisions 1–3): two short `ink-soft` lines, `border-t border-line`, full width.
3. Write `components/chat/EmptyState.tsx` (Decision 5): centered icon + `app-flow.md`'s verbatim example copy.
4. Write `components/chat/ErrorState.tsx` (Decisions 6–7): takes `{ message: string; onRetry: () => void }`, renders `AlertCircle` + the message + a "Try again" button using neutral tokens only.
5. In `components/chat/ChatThread.tsx`: extract `requestAnswer(message: string)` from the body of `handleSubmit` (everything from the `fetch` call onward); add `lastMessage` state, set alongside the optimistic user-bubble append in `handleSubmit`; render `<EmptyState />` when `messages.length === 0` in place of the current bare `<div>`; render `<DisclaimerBar />` as the final flex item after the form; swap the inline error `<p>` for `<ErrorState message={status.message} onRetry={() => requestAnswer(lastMessage)} />`.
6. In `architecture.md`: update the `components/chat/` folder-structure comment to include `EmptyState, ErrorState, DisclaimerBar`.
7. Manually verify against `npm run dev`, hitting the real deployed Supabase/OpenAI backend:
   - On load, with zero messages, `EmptyState`'s icon and exact copy render instead of blank space; `DisclaimerBar` is visible below the input at the same time.
   - After a real exchange, `DisclaimerBar` is still visible (persistent across states, per `ui-context.md`).
   - A simulated failure (e.g., an invalid/empty request, or forcing the fetch offline) renders `ErrorState` — not the old bare text — with a visibly different icon/styling from `EscalationCard` and no `urgent`/`urgent-soft` color anywhere on it.
   - Clicking "Try again" resubmits the exact failed message, does not add a second user bubble, and on success appends the real assistant response.
   - The pending "Thinking…" indicator is unchanged from Spec 08.
   - The three `console.error` call sites in `app/api/chat/route.ts` log a number, not the message text — trigger one (e.g. an invalid `OPENAI_API_KEY` restart, same technique as Spec 06's verification) and inspect the actual server log output.
   - `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly.

## New dependencies

None. `lucide-react` (`MessageCircleQuestion`, `AlertCircle`) is already a dependency.

## Status: IMPLEMENTED AND VERIFIED

All files written/modified per Decisions 1–11 and the found-and-fixed logging issue: `app/api/chat/route.ts` (three `console.error` calls now log `message.length`), `components/chat/DisclaimerBar.tsx`, `EmptyState.tsx`, `ErrorState.tsx` (new), `ChatThread.tsx` (refactored — `requestAnswer` extracted, `lastMessage` state added, `EmptyState`/`ErrorState`/`DisclaimerBar` wired in), `architecture.md` (`components/chat/` listing updated with the three new names). `npx tsc --noEmit` and `npm run lint` both clean. `ErrorState`'s retry control ended up using the generated `Button` primitive with `variant="link"`, explicitly overridden to `text-brand` after confirming in `app/globals.css` that shadcn's own `--primary` token is a separate grayscale value, not an alias for `--brand` — a small implementation detail not pinned down at the decision-writing stage, resolved during implementation rather than left inconsistent with `ui-context.md`'s "brand = interactive elements, links" rule.

Live-verified against the user's own running dev server: the empty-state icon and exact `app-flow.md` copy, the disclaimer sentence, and the privacy sentence all confirmed present in the rendered homepage HTML on a fresh load. The 400 (empty-message) and real grounded-answer (`simple_version`/`pidgin_version` intact) API paths were re-tested via `curl` after the `route.ts` logging edits to confirm nothing broke. The three fixed `console.error` call sites were confirmed correct by direct code review (`grep` against the edited file) rather than by triggering them live — doing so would require deliberately breaking the API key on the user's live, shared dev server (the technique Spec 06 used for its own equivalent check), which wasn't done without asking first.

Not machine-verified in this pass (would need an actual browser, not curl/HTML-inspection): clicking "Try again" and confirming it resends the exact failed message without a duplicate user bubble, and the pending indicator's continued correct behavior alongside the new error/empty states. These rely on the same `setMessages`-append pattern and shared `requestAnswer` function already covering Spec 08's original logic, so they're treated as code-reviewed-correct rather than independently reproduced live — flagged explicitly rather than assumed, matching Specs 07–09's own deferred-item notes.

## Verify checklist

- [x] `app/api/chat/route.ts`'s three `console.error` calls log `message.length`, not `message` — confirmed via direct code review/grep; **not verified against real server log output this pass** (would require deliberately breaking the user's live dev server's API key — chosen not to without asking first)
- [x] `DisclaimerBar.tsx` written, renders both lines, positioned as `ChatThread.tsx`'s final flex item with `border-t` — confirmed live via rendered homepage HTML
- [x] `EmptyState.tsx` written, renders on zero messages with `app-flow.md`'s verbatim example copy — confirmed live via rendered homepage HTML
- [x] `ErrorState.tsx` written, uses `AlertCircle` (not `AlertTriangle`) and only neutral tokens (no `urgent`/`urgent-soft` anywhere)
- [x] `ChatThread.tsx` refactored: `requestAnswer` extracted and shared between `handleSubmit` and the retry button; `lastMessage` state added
- [ ] "Try again" resubmits the failed message without duplicating the user bubble — **not independently verified this pass, no browser available; code-reviewed only (see Status above)**
- [x] `DisclaimerBar` visible in every state: empty, populated, pending, error — structurally guaranteed by its position outside all conditional blocks in `ChatThread.tsx`; confirmed present on the empty state live, not separately re-confirmed on the other three states this pass
- [x] `architecture.md`'s `components/chat/` listing updated with the three new names
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [x] No raw hex/pixel values outside `app/globals.css`'s `@theme` block in any new/modified file
- [x] `progress-tracker.md` updated: Spec 10 marked complete, Decisions 1–11 logged, the found-and-fixed logging issue logged, live-verification results logged, the Open Question below carried forward

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete once verified; log Decisions 1–11 and the found-and-fixed logging issue; log live-verification results.
- `architecture.md` — **update required** (Decision 10) — add `EmptyState, ErrorState, DisclaimerBar` to the `components/chat/` folder-structure comment.
- `database-schema.md` — no change.
- `app-flow.md` — no change; states 1 and 5 are already described there, this spec implements them as specified (state 1's example copy used verbatim).
- `ui-context.md` — no change; the Disclaimer bar component spec already exists and is fulfilled as written; `EmptyState`/`ErrorState` don't have dedicated ui-context.md entries but stay within the existing token system (Decision 7).
- `code-standards.md` — no change.

## Open Questions (carry forward to `progress-tracker.md`)

- **Should the disclaimer bar also get Simple/Pidgin copy?** Deliberately not built here (Decision 4) — same fixed-safety-copy reasoning Spec 09 used to exclude the escalation card. If yes, this would need reviewed fixed-copy pairs the same way `NO_GROUNDED_INFO_MESSAGE_SIMPLE`/`_PIDGIN` did in Spec 09 — a small follow-up, not a blocker.
