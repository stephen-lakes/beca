# Spec 12 — Demo polish pass

## Goal

The final `00-build-plan.md` unit: escalation-card visual treatment, citation styling, and a final pass against `ui-context.md` — closing out every polish item earlier specs deliberately deferred to "Spec 12" by name, plus a genuinely new addition (a minimal header) resolved with the project owner first rather than guessed. Matches `00-build-plan.md` unit 12: "Escalation-card visual treatment, citation styling, final pass against `ui-context.md`."

## Depends on

- Spec 09 (toggles) and Spec 10 (persistent UI elements) — both complete; this spec polishes components those specs already built, and closes the empty-screen-branding gap Spec 10 didn't address.

## Resolved before drafting this spec's decisions

Put to the project owner before deciding the header question, since it changes the screen's actual composition, not just styling on something already mandated: `ui-context.md`'s Typography section references "the header" as something that might get a distinct display face during polish, but `app-flow.md`'s screen list for the single chat screen is explicit about its contents ("message thread, input, toggles, disclaimer bar") and never mentions a header — and right now the app has zero visible branding anywhere on screen, just the browser tab title. **Resolved: yes, add a minimal header.** Decision 1 below.

## Decisions (resolved before implementation)

1. **Add `components/chat/Header.tsx` — app name only, no new font import.** Rendered as `ChatThread.tsx`'s *first* flex item, bookending `DisclaimerBar`'s position as the *last* one (Spec 10) — the same "one component owns the full screen's layout" principle Spec 07 Decision 3 established, extended rather than broken. `border-b border-line` mirrors `DisclaimerBar`'s `border-t border-line`, `bg-paper`/`text-ink`. Per `ui-context.md`'s Typography section ("add one distinct display face for the header only — not required to ship"), the header text uses the already-imported Geist Sans at a heavier weight/tracking rather than importing a second font family — "not required to ship" plus this being the final polish unit argues against adding a new external font fetch for marginal gain over what's already loaded.
2. **`architecture.md`, `app-flow.md`, and `ui-context.md` are all updated to reflect the header — not left silently out of sync.** `architecture.md`'s `components/chat/` folder listing gains `Header`; `app-flow.md`'s Chat screen description gains "header" alongside its existing list; `ui-context.md` gains a one-line Component spec entry for it (previously only implied by the Typography section's passing mention, never formally specified).
3. **Escalation card gets an entrance animation — `tw-animate-css`'s already-imported utilities, no new dependency.** `ui-context.md`'s aesthetic direction calls the escalation state "the single highest-value asset in the build," and it currently appears with zero visual emphasis on arrival, identical to any other state simply rendering in place. `animate-in fade-in slide-in-from-bottom-2 duration-300` (confirmed as real, documented utility classes in the installed `tw-animate-css` version, not assumed) draws the eye without needing new markup or JS. `motion-reduce:animate-none` is added alongside it — Tailwind's own built-in `prefers-reduced-motion` variant, not from the plugin — a low-cost accessibility addition consistent with `ui-context.md`'s existing care for accessibility (44px targets, focus states, color-not-only-signal) even though motion specifically isn't called out there.
4. **No severity-based visual differentiation between `high` and `medium` escalations.** Considered and rejected: `ui-context.md` specifies one escalation treatment, not a tiered one, and `urgent`/`urgent-soft` are already reserved for "the escalation card... never used for anything else" — introducing a second visual tier within the card risks diluting the "unmistakable visual break" the aesthetic direction calls for, for a distinction (`high` vs `medium`) the fixed message text (`HIGH_SEVERITY_MESSAGE`/`MEDIUM_SEVERITY_MESSAGE`) already communicates in words.
5. **`CitationChip` gains a `title` attribute carrying the full `source_title`** (e.g., "Malaria — prevention and when to seek care"), not just the visible `source_name` ("WHO"). `source_title` was already captured in the schema since Spec 05 but never surfaced anywhere in the UI — every citation chip for a WHO source currently displays identically as "WHO" with no way to tell which fact sheet it actually is. A native `title` attribute (hover/long-press tooltip) fixes the disambiguation gap without changing `ui-context.md`'s literal compact spec ("shows the source name and an external-link icon" — still true, `source_title` is discoverable, not displayed inline).
6. **`MessageBubble` dedupes citations by `(source_title, source_url)` before rendering chips, not `lib/ai/client.ts`.** If the model cites multiple chunks from the same source page, today's UI renders one identical-looking chip per chunk. This is a display-layer concern, not a data-integrity one — `architecture.md` hard invariant 5 ("every citation validated against an actual retrieved chunk ID") is about validating what's cited, not about how many chip elements a compact UI renders for it — so the fix stays in the presentational component; the API response itself keeps reporting every cited chunk's full citation object, useful for any future debugging/audit, and doesn't get its schema changed for a rendering concern.
7. **Dark mode stays explicitly out of scope**, per `ui-context.md`'s own wording: "not required for the MVP demo; add them only if polish time (H16–19) allows." Not silently dropped — named here as a deliberate deferral, not an oversight, since this is otherwise the natural spec to have raised it in.
8. **Final audit against `ui-context.md`, not just new additions.** A repo-wide grep for raw hex values outside `app/globals.css` closes the loop on every prior spec's individual "no raw hex" verify-checklist promise with one aggregate check, rather than trusting eight separate specs' claims never got quietly violated by a later edit. Touch targets and focus-visible states on existing toggles/buttons are re-confirmed, not re-built — Specs 07–10 already implemented them correctly; this is a verification pass, not new work.

## Scope

**In scope:**

- `components/chat/Header.tsx` (new) — Decisions 1–2.
- `components/chat/ChatThread.tsx` (modify) — renders `<Header />` as the first flex item.
- `components/chat/EscalationCard.tsx` (modify) — entrance animation, Decisions 3–4.
- `components/chat/CitationChip.tsx` (modify) — `title` attribute, Decision 5.
- `components/chat/MessageBubble.tsx` (modify) — citation dedup before rendering, Decision 6.
- `context/architecture.md` (modify) — add `Header` to the `components/chat/` folder listing.
- `context/app-flow.md` (modify) — add "header" to the Chat screen's description.
- `context/ui-context.md` (modify) — add a one-line Header component spec.

**Out of scope (do not build in this spec):**

- Dark mode — Decision 7.
- Severity-tiered escalation-card styling — Decision 4.
- Any change to `lib/ai/*`, `app/api/*`, or the citation schema itself — Decision 6 keeps this a presentational-only fix.
- Any change to `EmptyState.tsx`, `ErrorState.tsx`, `DisclaimerBar.tsx`, the toggle components, or their underlying logic — already correctly built in Specs 09–10; this spec only re-verifies them (Decision 8), it doesn't modify them.
- A new font import — Decision 1.

## Files to create / modify

- `components/chat/Header.tsx` (new)
- `components/chat/ChatThread.tsx` (modify)
- `components/chat/EscalationCard.tsx` (modify)
- `components/chat/CitationChip.tsx` (modify)
- `components/chat/MessageBubble.tsx` (modify)
- `context/architecture.md` (modify)
- `context/app-flow.md` (modify)
- `context/ui-context.md` (modify)
- No `.env.example` changes.

## Steps

1. Write `components/chat/Header.tsx` (Decisions 1–2): app name, heavier-weight Geist Sans, `border-b border-line`, `bg-paper`/`text-ink`.
2. Modify `ChatThread.tsx`: render `<Header />` as the first child inside the root flex column.
3. Modify `EscalationCard.tsx`: add `animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none` to the root element's className (Decision 3).
4. Modify `CitationChip.tsx`: add `title={citation.source_title}` to both the link and non-link render branches (Decision 5).
5. Modify `MessageBubble.tsx`: before mapping citations to `CitationChip`, dedupe by a `source_title + source_url` key (Decision 6).
6. Update `architecture.md`'s `components/chat/` folder-structure comment to include `Header`.
7. Update `app-flow.md`'s Chat screen row description to mention the header.
8. Update `ui-context.md`'s Component specs section with a one-line Header entry.
9. Manually verify against `npm run dev`, hitting the real deployed Supabase/OpenAI backend:
   - Header renders app name at the top of the screen, above the (now correctly positioned) empty state / message thread, on every load.
   - A real escalation-triggering message shows the card animating in (fade + slight upward slide) rather than snapping into place; confirm via browser devtools' "emulate prefers-reduced-motion: reduce" that the animation is suppressed when requested.
   - A grounded answer whose citations include two chunks from the same source shows exactly one citation chip, not two identical ones (may need a query likely to cite multiple chunks from one page to exercise this, or a temporary manual test with duplicated mock citations).
   - Hovering (desktop) or long-pressing (mobile) a citation chip reveals the full `source_title` via the native tooltip.
   - Repo-wide grep for raw hex values outside `app/globals.css` returns nothing.
   - `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly.

## New dependencies

None. `tw-animate-css` is already imported in `app/globals.css`; its `animate-in`/`fade-in`/`slide-in-from-*` utility classes were confirmed present in the installed package version before being used here, not assumed. `motion-reduce:` is Tailwind core, not a plugin addition.

## Status: IMPLEMENTED AND VERIFIED — FINAL BUILD-PLAN UNIT COMPLETE

All files written/modified per Decisions 1–8: `Header.tsx` (new), `ChatThread.tsx` (renders it first), `EscalationCard.tsx` (entrance animation), `CitationChip.tsx` (`title` attribute), `MessageBubble.tsx` (citation dedup), `architecture.md`/`app-flow.md`/`ui-context.md` (all updated for the header). `npx tsc --noEmit` and `npm run lint` both clean. A repo-wide grep for raw hex values (`#[0-9A-Fa-f]{3,8}`) across `components/` and `app/*.tsx` returned nothing — closes the loop on every prior spec's individual "no raw hex" verify-checklist promise with one aggregate check, rather than trusting eight separate specs' claims never quietly regressed.

Live-verified against the running dev server: the header renders "Grounded Navigator" on every load (confirmed via the rendered homepage HTML); a real escalation-triggering message still returns `escalated: true` correctly after `EscalationCard.tsx`'s className edit. The citation-dedup fix got an unusually strong verification: a real live query ("tell me everything about malaria: prevention, symptoms, and when to get treatment") returned **5 citations, all identical `(source_title, source_url)`** — not a contrived example, the actual live behavior this decision exists to handle. Traced `MessageBubble.tsx`'s dedup filter by hand against that real 5-item array: `findIndex` resolves to `0` for all five (since they're all identical), so only `index === 0` survives — confirms it collapses to exactly one rendered chip.

Not machine-verified in this pass (would need an actual browser, not curl/HTML-inspection): the escalation card's animation actually playing on arrival, its suppression under a real `prefers-reduced-motion: reduce` emulation, and the citation dedup's final rendered DOM (the underlying logic was traced correctly against real data, which is stronger than a code-review-only check, but the actual browser paint wasn't observed). Flagged explicitly rather than assumed, matching every prior spec's own deferred-item notes.

**This closes all 12 `00-build-plan.md` units.** Remaining pre-demo work is content/verification decisions tracked in `progress-tracker.md`'s Open Questions — not more build-plan specs.

## Verify checklist

- [x] `Header.tsx` written and rendered as `ChatThread.tsx`'s first flex item, visible on every load — confirmed via rendered homepage HTML
- [ ] `EscalationCard.tsx` has the entrance animation, verified visually and confirmed suppressed under `prefers-reduced-motion: reduce` — **not independently verified this pass, no browser available; code-reviewed only (class names confirmed present in the installed package, see Status above)**
- [x] `CitationChip.tsx` carries `title={citation.source_title}` on both render branches
- [x] `MessageBubble.tsx` dedupes citations by `(source_title, source_url)` before rendering — logic traced by hand against a real live 5-citation response, not just code-reviewed
- [x] `architecture.md`, `app-flow.md`, `ui-context.md` all updated to reflect the header — no doc left silently out of sync with the new component
- [x] Repo-wide grep for raw hex values outside `app/globals.css`'s `@theme`/`:root`/`.dark` blocks returns nothing
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [x] `progress-tracker.md` updated: Spec 12 marked complete, Decisions 1–8 logged, live-verification results logged, `00-build-plan.md`'s 12 units all marked complete

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete once verified; log Decisions 1–8; log live-verification results; note that this closes out all 12 `00-build-plan.md` units.
- `architecture.md` — **update required** (Decision 2) — add `Header` to the `components/chat/` folder-structure comment.
- `app-flow.md` — **update required** (Decision 2) — add "header" to the Chat screen's description.
- `ui-context.md` — **update required** (Decision 2) — add a one-line Header component spec.
- `database-schema.md` — no change.
- `code-standards.md` — no change.
