# Spec 07 — Chat UI shell (mock data)

## Goal

Build the presentational chat UI — `ChatThread`, `MessageBubble`, `CitationChip`, `EscalationCard` — driven entirely by local mock data typed against the real `ChatResponseSchema`/`EscalationResponseSchema` shapes (Spec 06, already implemented). Proves out `ui-context.md`'s visual design — especially the escalation state's "unmistakable visual break" — with zero network calls, so Spec 08 can focus purely on wiring, not layout. Matches `00-build-plan.md` unit 07: "`ChatThread`, `MessageBubble`, `CitationChip`, `EscalationCard` components wired to a mocked response matching the schema."

## Depends on

- Spec 01 (project setup — done; Next.js/Tailwind v4/shadcn scaffold, color tokens already in `app/globals.css`).
- Not functionally dependent on Spec 05/06 (no API calls in this spec), but reuses their types/constants from `lib/ai/schema.ts` for the mock data — see Decision 2. Per `00-build-plan.md`, this unit can run in parallel with 03–06; it happens to land after them here, which only means the real types already exist to borrow.

## Decisions (resolved before implementation)

1. **Mock data lives in `components/chat/mock-data.ts`, not `lib/`.** `lib/ai/`, `lib/kb/`, `lib/directory/` are reserved by `code-standards.md`'s file-organisation rule for real provider/DB calls; a fixtures file that exists only to be deleted once Spec 08 wires the real endpoint doesn't belong there and would force an `architecture.md` folder-structure update for something temporary. Colocating it with the components that consume it keeps this spec's footprint entirely inside `components/chat/` (plus one new file under `components/ui/`, Decision 10) — matching `ai-workflow-rules.md`'s "never touch more than one system boundary per step" rule.
2. **Mock data reuses the real fixed-copy constants from `lib/ai/schema.ts`** (`NO_GROUNDED_INFO_MESSAGE`, `HIGH_SEVERITY_MESSAGE`, `MEDIUM_SEVERITY_MESSAGE`) rather than re-typing similar strings, and types every mock object against the real `ChatResponse` / `EscalationResponse` / `Citation` / `DirectoryEntry` types from the same file. This is not a boundary violation: `code-standards.md` hard invariant 3 restricts importing the *provider SDKs* (`openai`, `@supabase/supabase-js`) outside `lib/`/`app/api/`, not importing the shared response types the client will always need in order to type what `/api/chat` returns. Only the parts that require a live model or database call — answer text, `chunk_id`s, `matched_entries` rows — are fabricated by hand.
3. **`ChatThread` is the one `'use client'` component; `app/page.tsx` stays a Server Component** that only renders `<ChatThread />`. Matches `code-standards.md`: "Server Components by default. `'use client'` only on components that need interactivity (chat input, toggles)." `MessageBubble`, `CitationChip`, and `EscalationCard` are pure presentational components (props in, JSX out) and don't need the directive themselves.
4. **Interaction model for this spec:** the thread is pre-seeded with three fixed mock turns on load — one grounded answer with a citation, one no-grounded-information answer, one escalation — so all four visual states this spec owns (user bubble, grounded assistant bubble, no-grounded-info bubble, escalation card) are visible with no interaction required. The input box is fully wired (controlled input, submit on Enter or button click, appends a real user bubble), but submitting appends the *next* item from a fixed 3-response round-robin queue (the same three mock responses, cycling by index modulo 3) rather than reacting to what was typed. This is deliberately throwaway: it proves out the exact state-append mechanism (`setMessages(prev => [...prev, newTurn])`) that Spec 08 will reuse verbatim when it swaps the queue-pop for a real `POST /api/chat` call, without this unit touching any real classification or retrieval logic (`ai-workflow-rules.md`'s split rule: RAG pipeline and urgency classifier stay out of a UI-shell unit).
5. **`MessageBubble` takes no separate "variant" prop for grounded vs. no-grounded-info.** For assistant turns it takes the full `ChatResponse` object and derives its visual treatment from `response.grounded` (citations render only when `grounded === true`, matching the invariant already enforced server-side in `lib/ai/client.ts` that `citations` is empty exactly when `grounded` is false). Keeps the component schema-driven instead of introducing a second classification the caller would have to keep in sync with the data.
6. **`EscalationCard` is a separate component from `MessageBubble`, never a bubble variant.** `app-flow.md` state 3 is explicit: "Never rendered as a plain chat bubble." `ChatThread` branches on the turn's `escalated` field (present on both real response shapes since Spec 06) to decide which component to render — the same `escalated`-first branch Spec 08's real client code will use.
7. **Empty state and error state are explicitly out of scope** — both belong to Spec 10 per `00-build-plan.md` ("Disclaimer, privacy notice, error/empty states"). Decision 4's pre-seeded thread means `ChatThread` never actually renders zero messages in this spec, so no placeholder UI needs to exist yet. Loading state (a pending assistant turn while a real request is in flight) is also out of scope — nothing here is async.
8. **Persistent disclaimer bar is out of scope** (also Spec 10), but the escalation card's *inline* disclaimer line is in scope — `ui-context.md`: "always includes the disclaimer line inline, not just in the global bar." No schema field carries this text (`EscalationResponseSchema` has no disclaimer field), so it's fixed copy written directly in `EscalationCard.tsx`: **"This is general information, not a diagnosis — always follow the advice of a qualified health worker."**
9. **Touch target and focus-state hygiene apply now, not just at Spec 09.** `ui-context.md`'s 44×44 minimum is stated for "all toggles" specifically (none exist yet — Spec 09), but the chat input's submit button is the one interactive control this spec ships, so it's held to the same bar: `min-h-11` (44px) applied via `className` at the call site, not by hand-editing the generated `components/ui/button.tsx` primitive (`architecture.md`: "do not hand-edit generated files"). Visible focus states come from the shadcn/base-ui primitives' default `focus-visible` styling — not adding anything custom unless the verify pass shows it's missing.
10. **New shadcn primitive: `components/ui/input.tsx`**, generated via `npx shadcn add input` for the message text field — no hand-rolled `<input>`, keeping every form field on the same generated-primitive pattern as `Button`. Not a new npm package (`shadcn` is already a devDependency since Spec 01) but noted per `code-standards.md`'s dependency-transparency spirit, since it is new generated code entering the repo.
11. **`CitationChip` is a plain styled element, not a shadcn `Badge`.** Renders `source_name` plus an external-link icon (`lucide-react`, already a dependency) exactly per `ui-context.md`: "small, safe-colored, shows the source name and an external-link icon." No `Badge` primitive exists yet and one isn't worth adding for this single, fully-specified use — colors/radius come straight from the `safe` token. If `source_url` is null (internally-authored content, per `database-schema.md`), the chip renders as static text, not a link — there's nothing to link to.
12. **`verified !== 'true'` directory entries render a small "contact unconfirmed" qualifier** next to the contact line, surfacing `SCOPE.md`'s known-unverified-contact-info caveat in the one place a user would actually act on it, not only in an internal tracking doc. `verified === 'name-only'` additionally suppresses the contact line entirely — there is nothing to show (`database-schema.md`'s `contact` column is nullable, and this is the real case where it's null in the Spec 04 seed data). Mock data includes at least one entry of each `verified` value so this path is visually checkable in this spec.

## Scope

**In scope:**

- `components/chat/mock-data.ts` (new) — a `ChatTurn` discriminated union type (`{ role: 'user'; text: string } | ({ role: 'assistant' } & ChatResponse) | ({ role: 'assistant' } & EscalationResponse)`), three seed turns (grounded + citation, no-grounded-info, escalation) each preceded by a mock user turn, and a 3-item round-robin response queue for Decision 4's submit flow. All typed against `lib/ai/schema.ts`.
- `components/chat/CitationChip.tsx` (new) — renders one `Citation`, per Decision 11.
- `components/chat/MessageBubble.tsx` (new) — renders one user turn or one `ChatResponse` assistant turn, per Decision 5.
- `components/chat/EscalationCard.tsx` (new) — renders one `EscalationResponse` turn: severity-keyed `message` (already server-computed text, rendered as-is — no client-side severity logic), `matched_entries` list with the Decision 12 qualifier, inline disclaimer line (Decision 8).
- `components/chat/ChatThread.tsx` (new) — `'use client'`; owns `messages` and `roundRobinIndex` state (Decision 4); renders the seeded thread; renders the controlled input + submit control; branches each turn on `escalated` (Decision 6) to `MessageBubble` or `EscalationCard`.
- `components/ui/input.tsx` (new, shadcn-generated, Decision 10).
- `app/page.tsx` (modify) — replace the placeholder paragraph with `<ChatThread />`, keeping the existing `bg-paper` wrapper.

**Out of scope (do not build in this spec):**

- Any real API call — no `fetch('/api/chat')` anywhere in this spec. Spec 08's entire job.
- `LanguageToggle` / `ReadingLevelToggle` and any `simple_version`/`pidgin_version` rendering — Spec 09.
- Persistent disclaimer bar, privacy notice, empty state, error state, offline/loading state — Spec 10 (Decisions 7–8).
- Any change to `lib/ai/schema.ts`, `lib/ai/prompts.ts`, `lib/ai/classify.ts`, `lib/directory/lookup.ts`, or either `app/api/*` route — this spec only reads types/constants from `lib/ai/schema.ts`, never modifies it.
- Any change to `data/clinic_directory.json` or `data/red_flag_rules.json` — protected files per `ai-workflow-rules.md`; the mock `matched_entries` rows are hand-authored fixtures, not pulled from the real seed data.

## Files to create / modify

- `components/chat/mock-data.ts` (new)
- `components/chat/CitationChip.tsx` (new)
- `components/chat/MessageBubble.tsx` (new)
- `components/chat/EscalationCard.tsx` (new)
- `components/chat/ChatThread.tsx` (new)
- `components/ui/input.tsx` (new, shadcn-generated)
- `app/page.tsx` (modify)
- No `.env.example` changes — no new env vars, no new server calls.

## Steps

1. `npx shadcn add input` → generates `components/ui/input.tsx`.
2. Write `components/chat/mock-data.ts`: the `ChatTurn` type, the three seeded exchanges, and the round-robin queue, per Scope above.
3. Write `components/chat/CitationChip.tsx` (Decision 11).
4. Write `components/chat/MessageBubble.tsx` (Decision 5) — user variant and assistant variant (grounded / no-grounded-info derived from `grounded`).
5. Write `components/chat/EscalationCard.tsx` (Decisions 6, 8, 12).
6. Write `components/chat/ChatThread.tsx` (Decisions 3, 4, 6, 9) — seeded state, controlled input, submit handler, per-turn branch to `MessageBubble` / `EscalationCard`.
7. Modify `app/page.tsx` to render `<ChatThread />` in place of the current placeholder `<p>`.
8. Manually verify against `npm run dev` (no automated tests exist for UI yet — this is a visual/manual pass, consistent with how Specs 01's deploy shell was verified):
   - All four states (user bubble, grounded answer + citation chip, no-grounded-info bubble, escalation card) visible on load, no interaction needed.
   - Typing a message and submitting appends a user bubble followed by the next queued mock response; submit at least 4 times to confirm the queue wraps correctly (Decision 4).
   - Escalation card is visually unmistakable from a normal bubble — `urgent` top border, `urgent-soft` background — and never appears as a chat bubble.
   - The `verified: 'false'` mock entry shows the "unconfirmed" qualifier; the `verified: 'name-only'` mock entry shows the qualifier and no contact line (Decision 12).
   - The mock citation with a non-null `source_url` renders as a link with the external-link icon; a second mock citation (if included) with a null `source_url` renders as non-clickable text.
   - No raw hex or arbitrary pixel values in any new file — only `ui-context.md`'s tokens (`bg-paper`, `text-ink`, `text-ink-soft`, `border-line`, `bg-brand`/`text-brand`, `border-urgent`/`bg-urgent-soft`, `text-safe`) and Tailwind's default spacing scale.
   - No `openai` or `@supabase/supabase-js` import anywhere under `components/` — only type/constant imports from `lib/ai/schema.ts`.
   - Submit button meets the 44px touch target; Tab-key check confirms a visible focus ring on both the input and the submit button.

## New dependencies

None. `lucide-react` and `shadcn` are already dependencies (Spec 01/05). One new shadcn-generated primitive, `components/ui/input.tsx` (Decision 10) — not an npm package addition.

## Status: IMPLEMENTED AND VERIFIED

All six files written/generated as scoped. `npx tsc --noEmit` and `npm run lint` both clean. `npm run dev` started cleanly (Turbopack, ready in 5.6s) and `GET /` returned `HTTP 200` with no server-side compile or render errors. The rendered HTML was inspected directly (not just eyeballed in a screenshot) for every piece of mock content this spec's decisions call for: the grounded malaria answer plus its `WHO` citation chip, the verbatim `NO_GROUNDED_INFO_MESSAGE` text, the escalation card's "Please seek care" label, both mock `matched_entries` (Massey Street Children's Hospital with the `(unconfirmed)` qualifier next to its contact, and the LASUTH `name-only` entry rendering "Contact unconfirmed — no number on file" with no contact line), and the inline "not a diagnosis" disclaimer line — all present. A repo-wide grep of `components/chat/` for raw hex values and for `openai`/`@supabase/supabase-js` imports under `components/` both came back empty.

The seed data was extended beyond the original draft to add a second citation with a null `source_url` (internally-authored content, per `database-schema.md`) specifically so `CitationChip`'s non-link branch would actually render, not just be code-reviewed — re-fetched the HTML and confirmed it renders as `<span>internally authored</span>`, not an `<a>` tag.

Not machine-verified in this pass (would need an actual browser, not curl): the round-robin submit interaction across ≥4 clicks, and keyboard-Tab focus-ring visibility. Both rely only on unmodified shadcn/base-ui primitive behavior (`Input`/`Button`, unedited) and the same `setMessages` append pattern already exercised by the seeded turns rendering correctly, so they're treated as code-reviewed-correct rather than independently reproduced live — flagged here explicitly rather than silently assumed, matching how Spec 06 flagged its one deferred case.

## Verify checklist

- [x] `components/chat/mock-data.ts`, `CitationChip.tsx`, `MessageBubble.tsx`, `EscalationCard.tsx`, `ChatThread.tsx` written; `components/ui/input.tsx` generated
- [x] `app/page.tsx` renders `<ChatThread />`
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [x] All four visual states render on load with no interaction (Decision 4) — confirmed via rendered HTML inspection
- [ ] Submitting a typed message appends a user bubble + the next round-robin mock response; queue wraps correctly across ≥4 submits — code-reviewed only, not live-clicked in a browser this pass (see Status above)
- [x] Escalation card is never rendered as a chat bubble and is visually distinct per `ui-context.md`
- [x] `verified: 'false'` and `verified: 'name-only'` mock entries both present and both render correctly per Decision 12
- [x] `CitationChip` correctly branches on null vs. non-null `source_url` — both paths present in seed data and confirmed live in rendered HTML
- [x] No raw hex/pixel values outside `app/globals.css`'s `@theme` block in any new file
- [x] No Supabase or AI-provider SDK import anywhere under `components/` — type/constant imports from `lib/ai/schema.ts` only
- [x] Submit control meets the 44px minimum touch target (`min-h-11 min-w-11`); focus-ring behavior inherited unmodified from the shadcn/base-ui primitives, not independently keyboard-tested this pass
- [x] `progress-tracker.md` updated: Spec 07 marked complete, Decisions 1–12 logged, actual verification results logged

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete once verified; log Decisions 1–12 under Architecture Decisions; log the manual verify-pass results (this spec has no curl/API verification — visual/manual only).
- `architecture.md` — no change needed; `components/chat/`'s four named components and `components/ui/` were already listed in the folder structure, this spec just fulfills them.
- `database-schema.md` — no change; this spec reads no live data at all (all mock).
- `app-flow.md` — no change; this spec renders states 1–4 as already specified there, introduces nothing new.
- `ui-context.md` — no change; this spec implements what's already specified there exactly.
- `code-standards.md` — no change.
