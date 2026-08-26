# Spec 09 — Plain-language + Pidgin toggles

## Goal

Add two independent, opt-in toggles — "Simple" (`ReadingLevelToggle`) and "Pidgin" (`LanguageToggle`) — to every grounded and no-grounded-information assistant answer, letting the user switch that specific answer's displayed text between the default answer, a further-simplified restatement, and a Nigerian Pidgin restatement, with zero additional network calls. Matches `00-build-plan.md` unit 09: "Toggle UI + the corresponding fields in the AI response schema."

## Depends on

- Spec 08 (real `/api/chat` wiring) — already implemented and live-verified; this spec extends the same response shape it already renders.
- Not functionally dependent on any UI-only spec, but this is the first spec to touch `lib/ai/schema.ts`, `lib/ai/prompts.ts`, and `lib/ai/client.ts` together with `components/chat/`. `00-build-plan.md`'s unit 09 already bundles "toggle UI + schema fields" as one build-plan unit, the same way unit 06 bundled the classifier + escalation branch across `lib/directory`, `lib/ai`, and `app/api` — this isn't an ad hoc violation of `ai-workflow-rules.md`'s "one system boundary per step" default, it's a build-plan-approved exception for a feature that's inherently one generation call plus its matching display control.

## Resolved before drafting this spec

Put to the project owner before any decisions below were written, since it changes the schema shape and prompt design, not just an implementation detail: `lib/ai/prompts.ts`'s system prompt already requires the base `answer` to be plain, accessible language, yet `SCOPE.md`/`project-overview.md` both list "Plain-language toggle" as its own Must-Have feature distinct from the Pidgin toggle, and `lib/ai/schema.ts` already carried a forward-comment planning both a `simple_version` and a `pidgin_version` field. **Resolved: two independent opt-in toggles, both off by default.** `answer` (already plain, per the existing prompt) is always the baseline shown; "Simple" ON shows `simple_version` — an even-further-reduced-reading-level restatement; "Pidgin" ON shows `pidgin_version` instead. `SCOPE.md`'s "(default-on)" parenthetical is read as describing that plain language is the architectural default (already satisfied by `answer` itself), not a literal toggle-starts-flipped state.

## Decisions (resolved before implementation)

1. **Toggle scope: grounded and no-grounded-information answers only (`ChatResponseSchema`), not the escalation card.** `project-overview.md`'s Core user flow says the user can "toggle plain-language and Nigerian Pidgin on the same **answer**" — the escalation card isn't a RAG-generated answer, it's fixed, severity-keyed safety copy (`HIGH_SEVERITY_MESSAGE`/`MEDIUM_SEVERITY_MESSAGE`) plus live directory data. `ai-workflow-rules.md` is explicit: "do not guess — especially on anything touching the safety or escalation logic." Hand-translating fixed escalation copy into Pidgin without a review pass is exactly that kind of guess (the same review step Spec 04's `red_flag_rules.json` went through with the project owner before being trusted). **Not built here — tracked as an Open Question below**, not silently dropped and not guessed at.
2. **Both toggles are generated eagerly, in the same completion, every time the model runs — never a follow-up call.** `app-flow.md` Journey 3: "No new API call is needed if `simple_version`/`pidgin_version` were already returned in the original response." `ModelOutputSchema` gets two new required fields, `simple_version` and `pidgin_version` (both `z.string().min(1)`, same constraint style as `answer`), requested unconditionally whenever `generateAnswer` calls the model — including when the model itself sets `grounded: false` (the "context didn't adequately answer this" case, distinct from the deterministic zero-retrieval short-circuit) — because the model already produces an `answer` in that case too and the same toggle behavior should work on it.
3. **The deterministic zero-retrieval short-circuit in `app/api/chat/route.ts` gets its own fixed, hand-authored `simple_version`/`pidgin_version` — new constants, not model-generated.** That path never calls the model at all (Spec 05 Decision 3), so it can't ask the model for these either. Two new fixed-copy constants are added to `lib/ai/schema.ts` alongside `NO_GROUNDED_INFO_MESSAGE`: `NO_GROUNDED_INFO_MESSAGE_SIMPLE` and `NO_GROUNDED_INFO_MESSAGE_PIDGIN`. **Flagged, not hidden:** both are drafted by Claude in this spec, the same way `red_flag_rules.json` was Claude-drafted in Spec 04 — but unlike that file, these are non-clinical refusal copy, not a safety categorization, so this spec doesn't block on owner sign-off the way Spec 04 did. A native/fluent-Pidgin-speaker sanity check before the live demo is still recommended — logged as an Open Question, not skipped silently.
4. **`ChatResponseSchema` gains the same two required fields** (`simple_version: z.string()`, `pidgin_version: z.string()`), always populated by one of the two paths above — never optional, never nullable. `EscalationResponseSchema` is untouched (Decision 1).
5. **Citations are shared across all three text variants — no per-variant citation list.** Only the answer text changes between `answer`/`simple_version`/`pidgin_version`; the underlying retrieved chunks backing the claim don't change with register or language, so `citations` stays a single field on `ChatResponse`, unchanged from Spec 05/06/08.
6. **Faithfulness is enforced at the prompt level, not with new runtime validation code.** `architecture.md` hard invariants 1 and 2 (never answer outside retrieved context; never a diagnosis/drug+dosage/treatment plan) apply to `simple_version`/`pidgin_version` exactly as they already apply to `answer` — the new fields are restatements of the same generation call, not a separate unconstrained one. `buildSystemPrompt()` gets an explicit added rule: `simple_version` and `pidgin_version` must convey the same information as `answer` and must never introduce a new claim, drug name, dosage, or diagnosis not already present in `answer`. No new automated content-safety check validates this (there's no equivalent check on `answer` itself today either, beyond the existing citation/grounding-consistency check) — accepted as consistent with the existing enforcement style, not a new gap introduced by this spec.
7. **Toggle state lives per-`MessageBubble` instance, not globally on `ChatThread`.** `app-flow.md` Journey 3: "toggles... on an existing answer" — each assistant bubble already holds its own full `ChatResponse` object with all three text variants baked in, so each bubble owns its own two booleans (`simpleOn`, `pidginOn`) locally. No prop change to `ChatThread.tsx` is needed — it already spreads the full `ChatResponse` into `MessageBubble` (Spec 07), and every field this spec adds arrives the same way.
8. **When both toggles are on, Pidgin wins — a documented, low-risk tie-break, not a fourth generated variant.** `SCOPE.md`: Pidgin "functions as both 'another language' and 'simplified communication'" already, so a combined "simple Pidgin" register would be redundant with what Pidgin is already meant to deliver. Display precedence: `pidginOn ? pidgin_version : simpleOn ? simple_version : answer`. Both toggle buttons still reflect their own pressed state independently (per the resolved "two independent toggles" decision above) — this rule only decides which text renders, not whether a toggle visually appears pressed.
9. **No new `'use client'` directive on `MessageBubble.tsx` itself.** It gains local `useState` for the two toggle booleans, which needs a client component — but it's only ever rendered as a descendant of `ChatThread.tsx`, which already declares `'use client'` (Spec 07 Decision 3). Next.js's client boundary starts at that declaration, not at every interactive descendant; adding a redundant second directive isn't required and isn't done here.
10. **New shadcn primitive: `components/ui/toggle.tsx`**, via `npx shadcn add toggle` — matches `ui-context.md`'s component spec exactly ("Toggle (language / reading level) — shadcn `Toggle` or `Switch`... always labelled, visible active state"). `Toggle` chosen over `Switch`: these read as inline filter-style pills sitting under an answer bubble next to the citation row, not a system-settings on/off control, and `Toggle`'s `aria-pressed` semantics map directly to the two independent booleans this spec already needs. Not a new npm dependency — same shadcn-CLI pattern as `Input` in Spec 07.
11. **`components/chat/ReadingLevelToggle.tsx` and `components/chat/LanguageToggle.tsx`** — both new, both pure presentational (`{ pressed: boolean; onPressedChange: () => void }` props, no internal state), each wrapping one `Toggle` primitive labelled "Simple" and "Pidgin" respectively. Both names are already reserved in `architecture.md`'s folder structure (`components/chat/` listing names them explicitly) and `ui-context.md`'s component spec — this spec is what actually fulfills them, the same relationship Spec 07 had to its own four reserved component names.
12. **44×44 touch target applied to both toggles**, per `ui-context.md`: "Minimum touch target 44×44px on all toggles" — stated unconditionally there, unlike Spec 07's submit button (which wasn't literally required but was held to the same bar anyway). Applied via `min-h-11 min-w-11` at the call site, consistent with how Spec 07 sized the submit button, not by hand-editing the generated `Toggle` primitive.
13. **`MAX_COMPLETION_TOKENS` raised from 2048 to 3072** in `lib/ai/client.ts`. Three text fields are now generated per call instead of one; `simple_version`/`pidgin_version` are expected to be similar-length restatements rather than longer than `answer`, so a moderate bump (not a full 3×) covers the added content without materially inflating cost or latency.
14. **No change to `lib/ai/classify.ts` or its prompt.** The urgency classifier's `reasoning` field is explicitly internal-only ("never shown to the user... does not need to be... in plain language") — nothing about it is user-facing, so it has no toggle surface to extend.

## Scope

**In scope:**

- `lib/ai/schema.ts` (modify) — `ModelOutputSchema` gains `simple_version`/`pidgin_version` (Decision 2); `ChatResponseSchema` gains the same two fields (Decision 4); two new fixed constants `NO_GROUNDED_INFO_MESSAGE_SIMPLE`/`NO_GROUNDED_INFO_MESSAGE_PIDGIN` (Decision 3).
- `lib/ai/prompts.ts` (modify) — `buildSystemPrompt()` gains instructions for generating `simple_version` (reduced reading level, short sentences, everyday vocabulary) and `pidgin_version` (natural Nigerian Pidgin, not a literal word-for-word translation), plus the faithfulness rule (Decision 6).
- `lib/ai/client.ts` (modify) — `requestStructuredAnswer` reads `parsed.simple_version`/`parsed.pidgin_version` directly into the returned `ChatResponse` (no reconstruction needed — these are plain restated text, not citation metadata); `MAX_COMPLETION_TOKENS` raised to 3072 (Decision 13).
- `app/api/chat/route.ts` (modify) — the zero-retrieval short-circuit's `ChatResponseSchema.parse({...})` call adds `simple_version`/`pidgin_version` from the new fixed constants (Decision 3).
- `components/ui/toggle.tsx` (new, shadcn-generated, Decision 10).
- `components/chat/ReadingLevelToggle.tsx` (new, Decision 11).
- `components/chat/LanguageToggle.tsx` (new, Decision 11).
- `components/chat/MessageBubble.tsx` (modify) — local `simpleOn`/`pidginOn` state for the assistant branch only; renders both toggles below the answer text (and citations, if present); computes displayed text per Decision 8's precedence rule.

**Out of scope (do not build in this spec):**

- Any language/reading-level toggle on `EscalationCard` or its fixed severity messages — Decision 1, tracked as an Open Question below.
- Any new API call triggered by toggling — Decision 2 makes this unnecessary.
- A combined "simple Pidgin" fourth variant — Decision 8.
- Any change to `lib/ai/classify.ts`, `lib/directory/lookup.ts`, `app/api/services/route.ts` — Decision 14 and otherwise untouched.
- Any change to `ChatThread.tsx` — it already forwards the full `ChatResponse` object; no prop-shape change is needed there.
- Yoruba or any third language — explicitly out of scope per `project-overview.md`.

## Files to create / modify

- `lib/ai/schema.ts` (modify)
- `lib/ai/prompts.ts` (modify)
- `lib/ai/client.ts` (modify)
- `app/api/chat/route.ts` (modify)
- `components/ui/toggle.tsx` (new, shadcn-generated)
- `components/chat/ReadingLevelToggle.tsx` (new)
- `components/chat/LanguageToggle.tsx` (new)
- `components/chat/MessageBubble.tsx` (modify)
- No `.env.example` changes — no new env vars, no new provider call shape.

## Steps

1. `npx shadcn add toggle` → generates `components/ui/toggle.tsx`.
2. In `lib/ai/schema.ts`: add `simple_version`/`pidgin_version` to `ModelOutputSchema` and `ChatResponseSchema`; add `NO_GROUNDED_INFO_MESSAGE_SIMPLE` and `NO_GROUNDED_INFO_MESSAGE_PIDGIN` constants (Decisions 2–4).
3. In `lib/ai/prompts.ts`: extend `buildSystemPrompt()` with the simple-language and Pidgin generation instructions plus the faithfulness rule (Decision 6).
4. In `lib/ai/client.ts`: pass `simple_version`/`pidgin_version` from `parsed` straight into the returned object in `requestStructuredAnswer`; bump `MAX_COMPLETION_TOKENS` to 3072 (Decision 13).
5. In `app/api/chat/route.ts`: add the two new fixed fields to the zero-retrieval short-circuit's `ChatResponseSchema.parse({...})` call (Decision 3).
6. Write `components/chat/ReadingLevelToggle.tsx` and `components/chat/LanguageToggle.tsx` (Decision 11), each wrapping the new `Toggle` primitive with the 44×44 sizing (Decision 12).
7. Modify `components/chat/MessageBubble.tsx`: add `simpleOn`/`pidginOn` state to the assistant branch; render both toggles below the existing content; compute the displayed answer text per Decision 8's precedence.
8. Manually verify against `npm run dev`, hitting the real deployed Supabase/OpenAI backend:
   - A real in-KB question returns a response whose `simple_version` is genuinely shorter/simpler than `answer` (not just a copy) and whose `pidgin_version` reads as natural Pidgin, not a literal translation.
   - Toggling "Simple" on that bubble swaps the displayed text with zero network activity (confirm via browser devtools network tab — no new request fires); toggling it back off restores `answer`.
   - Toggling "Pidgin" on the same bubble shows `pidgin_version`; toggling both on shows Pidgin (Decision 8), toggling Pidgin back off while Simple stays on reveals `simple_version`.
   - A real out-of-KB question's no-grounded-info bubble shows the exact `NO_GROUNDED_INFO_MESSAGE_SIMPLE`/`NO_GROUNDED_INFO_MESSAGE_PIDGIN` text when toggled, sourced from the fixed constants (confirm this is the zero-retrieval path, not a model-generated refusal, by checking the question genuinely has no matching chunks).
   - A question where the model itself sets `grounded: false` (chunks retrieved but judged insufficient, if reproducible) shows model-generated `simple_version`/`pidgin_version` consistent with its own freeform `answer` — distinct from the fixed-constant case above.
   - The escalation card is unaffected — no toggles appear on it (Decision 1).
   - Both toggle buttons meet the 44×44 touch target and show a visible focus state on keyboard Tab.
   - `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly.

## New dependencies

None. `components/ui/toggle.tsx` is shadcn-CLI-generated code, not an npm package addition (same pattern as `Input` in Spec 07).

## Status: IMPLEMENTED AND VERIFIED

All backend changes written per Decisions 1–14: `lib/ai/schema.ts` (`ModelOutputSchema`/`ChatResponseSchema` extended, two fixed constants added), `lib/ai/prompts.ts` (generation instructions + faithfulness rule), `lib/ai/client.ts` (fields threaded through, `MAX_COMPLETION_TOKENS` → 3072), `app/api/chat/route.ts` (zero-retrieval short-circuit populated). `components/ui/toggle.tsx` generated via `npx shadcn add toggle`; its underlying `@base-ui/react/toggle` primitive's `.d.ts` was read directly to confirm the controlled `pressed`/`onPressedChange` API before wiring `ReadingLevelToggle.tsx`/`LanguageToggle.tsx` against it. `MessageBubble.tsx` updated with local toggle state and the Pidgin-wins precedence rule. `npx tsc --noEmit` and `npm run lint` both clean.

Live-verified with real `curl` requests against the real Supabase/OpenAI backend (via the user's own already-running dev server on port 3000 — a second `next dev` instance for the same project directory refused to start, which is expected Next.js behavior, not an error; hitting the API route directly doesn't touch the user's open browser tab's client-side state): (1) a real malaria question returned an `answer`, a genuinely shorter/simpler `simple_version`, and a natural-reading `pidgin_version` — all three conveying the same prevention measures (nets, repellent, coils, clothing, screens, indoor spraying, pre-travel doctor visit) with no added or dropped claims, citations unchanged; (2) an out-of-KB question returned the exact fixed `NO_GROUNDED_INFO_MESSAGE_SIMPLE`/`_PIDGIN` strings; (3) a red-flag phrase's escalation response was confirmed to carry no `simple_version`/`pidgin_version` keys at all, matching Decision 1's exclusion exactly.

Not machine-verified in this pass (would need an actual browser, not curl): the toggle buttons actually rendering inside a live assistant bubble's DOM, their pressed/`data-state=on` styling and focus-visible ring, the 44×44 touch target taking real visual effect, and Decision 2's "zero new network requests on toggle" claim actually holding under devtools inspection. These rely on the `Toggle` primitive's documented API and the same component-composition pattern already exercised by `Input`/`Button` in Specs 07–08, so they're treated as code-reviewed-correct rather than independently reproduced live — flagged explicitly rather than assumed, matching Specs 07 and 08's own deferred-item notes.

## Verify checklist

- [x] `ModelOutputSchema`/`ChatResponseSchema` both carry `simple_version`/`pidgin_version`; `NO_GROUNDED_INFO_MESSAGE_SIMPLE`/`NO_GROUNDED_INFO_MESSAGE_PIDGIN` added
- [x] `buildSystemPrompt()` instructs the model to produce both fields with the faithfulness rule (Decision 6)
- [x] `requestStructuredAnswer` returns both fields on every `ChatResponse`; `MAX_COMPLETION_TOKENS` raised to 3072
- [x] Zero-retrieval short-circuit in `app/api/chat/route.ts` populates both fields from the new fixed constants — verified live via curl
- [x] `components/ui/toggle.tsx` generated; `ReadingLevelToggle.tsx`/`LanguageToggle.tsx` written
- [x] `MessageBubble.tsx` renders both toggles on assistant turns only, with correct precedence (Pidgin wins when both on) — code-reviewed; not clicked in a live browser this pass (see Status above)
- [ ] A real grounded answer's Simple/Pidgin toggles both work with zero new network requests — **not independently verified this pass, no browser available; code-reviewed only (see Status above)**
- [x] The fixed-constant no-grounded-info path and the model-generated grounded:false path both show correct, distinct simple/Pidgin text — the fixed-constant path verified live; the model-generated `grounded: false` path (chunks retrieved but judged insufficient) was not separately reproduced this pass, as it depends on the model's own judgment call on a given query rather than a deterministic trigger
- [x] Escalation card unaffected — no toggle controls rendered on it; confirmed live via curl that the escalation JSON carries no `simple_version`/`pidgin_version` keys
- [ ] Both toggles meet the 44×44 touch target with a visible focus state — **not independently verified this pass, no browser available; code-reviewed only (see Status above)**
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [x] No raw hex/pixel values outside `app/globals.css`'s `@theme` block in any new/modified file
- [x] `progress-tracker.md` updated: Spec 09 marked complete, Decisions 1–14 logged, live-verification results logged, both Open Questions below carried forward

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete once verified; log Decisions 1–14; log live-verification results; carry forward both Open Questions below.
- `architecture.md` — no change; `LanguageToggle`/`ReadingLevelToggle` were already named in the folder structure, this spec just fulfills them.
- `database-schema.md` — no change; `simple_version`/`pidgin_version` are response-time fields, never persisted, matching the existing no-persistence model.
- `app-flow.md` — no change; Journey 3 already describes this exact flow ("no new API call... toggles on an existing answer"), this spec implements it as already specified.
- `ui-context.md` — no change; the Toggle component spec already exists, this spec fulfills it.
- `code-standards.md` — no change.

## Open Questions (carry forward to `progress-tracker.md`)

- **Should the escalation card also get Simple/Pidgin toggles for its fixed severity copy?** Deliberately not built here (Decision 1) — fixed safety copy shouldn't get a hand-guessed translation without the same kind of owner review `red_flag_rules.json` got in Spec 04. If yes, `HIGH_SEVERITY_MESSAGE`/`MEDIUM_SEVERITY_MESSAGE` (and the inline disclaimer line) would each need reviewed Simple/Pidgin fixed-copy pairs, plus a toggle added to `EscalationCard.tsx` — a small follow-up spec, not a blocker for the demo's core loop.
- **`NO_GROUNDED_INFO_MESSAGE_SIMPLE`/`NO_GROUNDED_INFO_MESSAGE_PIDGIN` are Claude-drafted, not reviewed by a fluent Pidgin speaker.** Lower stakes than Spec 04's red-flag taxonomy (non-clinical refusal copy, not a safety categorization), so this spec doesn't block on sign-off — but a quick native-speaker sanity check before the live demo is recommended, same spirit as `SCOPE.md`'s existing pre-demo checklist items (unverified emergency numbers, placeholder clinic entries).
