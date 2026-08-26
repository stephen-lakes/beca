# Spec 06 — Urgency classifier + escalation branch

## Goal

Add deterministic red-flag keyword matching and an AI urgency classifier to `POST /api/chat`, running on every message per `project-overview.md`. When either signals urgency, short-circuit the RAG answer path entirely and return a structured escalation response carrying a matched `directory_entries` row instead — matching `app-flow.md` state 3 ("never rendered as a plain chat bubble") and Journey 2 (the escalation flip).

## Depends on

- Spec 04 (directory seed load — done; `directory_entries` and `red_flag_rules` populated and live).
- Spec 05 (RAG retrieval + chat API — complete and fully verified live, on OpenAI after a provider switch from the originally-planned Anthropic Claude; see `progress-tracker.md` Architecture Decisions. This spec extends the same route and schema file but doesn't depend on generation specifically — the escalation branch never calls `generateAnswer`).

## Resolved: mental-health / self-harm escalation handling

Carried forward from `progress-tracker.md`'s Open Questions and flagged inline on `red_flag_rules.json` ids 59–63 as "revisit when Spec 06 designs the escalation branch, not before." Put to the project owner before writing this spec.

**Decision: no special case.** Imminent self-harm/suicide-risk red flags are escalated exactly like any other red flag — same `EscalationResponseSchema` shape, same canned severity-based copy (see Decision 5 below), same category-based directory lookup (`category: 'mental-health'` → Federal Neuro-Psychiatric Hospital, Yaba, contact still unverified per `SCOPE.md`). No crisis-specific copy, no routing override to also surface the emergency number. This closes the open question — do not reopen it without new instruction. The unverified contact number on that one directory row remains a separate, already-tracked pre-demo action item (`SCOPE.md`'s "Known unverified items"), not something this spec resolves.

## Decisions (resolved before implementation)

1. **Request contract stays `{ message: string }` — no conversation-history field.** Spec 05 Decision 9 flagged multi-turn state as "Spec 06+'s problem," but on inspection it isn't needed: `app-flow.md` Journey 2 says the deterministic check and the AI classifier "both run on the new message" (singular, not the thread), and `architecture.md` hard invariant 4 forbids persisting raw message text beyond the current session anyway. The escalation flip works statelessly — each POST is classified independently on its own content. This resolves Decision 9's flag without adding state.
2. **Both checks always run, in parallel, on every message — never short-circuited by each other.** `project-overview.md`: "Deterministic + AI urgency classifier running on every message." `app-flow.md` Journey 2 step 2: "The deterministic keyword check and the AI classifier both run." Implemented as `Promise.all([checkRedFlagKeywords(message), classifyUrgency(message)])` in the route — parallel, not sequential, to protect the ~5s response goal (`project-overview.md` goal 3).
3. **Deterministic check: case-insensitive substring match against `red_flag_rules.pattern`, no fuzzy matching.** A literal match against phrasing like "can't breathe" won't catch "she cannot breathe" — that gap is intentional, not an oversight: the deterministic layer is a fast, exact, high-precision safety net for near-identical phrasing; the AI classifier is the layer that actually interprets paraphrased or indirect descriptions. Flagged as tunable — revisit against the Spec 11 test-set, not treated as final, matching how Spec 05 flagged `min_similarity`/`match_count`.
4. **Escalation skips RAG generation entirely — no `generateAnswer` call when urgent.** `app-flow.md`: the escalation card renders "in place of a plain answer bubble," not alongside one. This is also the strongest possible enforcement of `architecture.md` hard invariant 2 (never diagnose, never a treatment plan) for the highest-risk message class: no LLM-generated free text is produced at all on the escalation path, only a canned template string plus structured `directory_entries` data. Cheaper and faster than generating an answer that would be discarded, too.
5. **Escalation message is fixed, severity-keyed template copy — not LLM-generated.** Two strings only: `high` → "This could be serious. Please seek care now — see the contact(s) below."; `medium` → "This should be checked by a health worker soon. See the contact(s) below." No per-category variation (per the resolved mental-health decision above — no special casing anywhere). Chosen over an LLM-generated escalation message for the same reason as Decision 4: the escalation path is the one place this app cannot afford a hallucinated or inconsistent message, and project-overview goal 2 ("100% of red-flag test queries trigger the escalation state") is easiest to verify against fixed, deterministic copy.
6. **Combining two signals when both fire:** `category` — prefer the deterministic hit's category (it's a direct `red_flag_rules.category` value, more precise than the classifier's free-form judgment); fall back to the AI classifier's category if only it fired. `severity` — take the higher of the two if both fired (`high` > `medium`).
7. **AI classifier output is constrained to the real category taxonomy via the zod output schema itself**, not validated after the fact — the structured-output schema (see Spec 05's `zodResponseFormat`/`ModelOutputSchema` pattern, `lib/ai/client.ts`) makes an invalid category structurally impossible for the model to return, the same mechanism Spec 05 already relies on for chunk-id citation shape. Category enum: the 8 real `directory_entries` categories (`emergency`, `general-tertiary`, `primary-care`, `maternal-care`, `child-health`, `mental-health`, `family-planning`, `malaria-treatment`, `general`) — excludes `disclaimer`, which is a scope-note row, not a real routing target (see `data/clinic_directory.json` entry #12).
8. **AI classifier failure degrades to deterministic-only, not to total failure.** `classifyUrgency` gets the same parse-and-retry-once contract as `generateAnswer` (Decision 5 of Spec 05), but if it still returns `null` after retry, the route does **not** fail the request — it proceeds using only the deterministic check's result and `console.error`s the classifier failure. Reasoning: an AI-classifier outage shouldn't take down the whole chat endpoint when the exact-phrasing safety net is still active and the RAG path for non-urgent content is unaffected. This is a narrower, escalation-specific fallback than Spec 05's Decision 6 generic 500 — it only applies to the classifier sub-call, not the route as a whole.
9. **`matched_entries` is an array, not a single nullable entry.** `category: 'emergency'` has two live `directory_entries` rows (Lagos ambulance/emergency service + the national 112 number) — both are relevant on an emergency escalation, not just one. Every other used category has exactly one row today (verified live in Spec 04), so this only visibly matters for `emergency`, but the shape is correct for all categories and doesn't need to special-case the one with two rows. Empty array is the defined (not undefined) behavior if a category has zero matching rows — shouldn't happen given Spec 04's cross-check, but the AI classifier's category is model output, so the code path must still be handled, not assumed impossible.
10. **`GET /api/services` is built in this spec.** It's named in `architecture.md`'s folder structure since Spec 01 but never assigned to a unit in `00-build-plan.md`; Spec 05 explicitly deferred it ("separate route, not part of this unit"). It's a thin GET wrapper over the same `lib/directory/lookup.ts` function the chat route calls directly (not via internal HTTP self-fetch — the chat route imports the lib function, same pattern as its existing `searchKb`/`generateAnswer` calls). Included here because it shares `lib/directory/lookup.ts`'s system boundary and has no other spec claiming it; independently curl-verifiable.
11. **`lib/directory/lookup.ts` holds both the red-flag keyword check and the directory-entry lookup, in one file.** `architecture.md`'s folder listing names only one file under `lib/directory/`. Both queries serve the same escalation domain and both are Supabase reads restricted to `lib/kb/` and `lib/directory/` per `architecture.md`'s system-boundaries section — `red_flag_rules` isn't KB content, so it belongs here, not in `lib/ai/`, even though "classification" is conceptually AI-adjacent. `lib/ai/classify.ts` only calls the AI provider (OpenAI, per Spec 05's provider switch); it never queries Supabase.
12. **Directory category enum lives in `lib/ai/schema.ts`**, alongside the other shared structured-output types, and `lib/directory/lookup.ts` imports it from there — not the reverse — since both `classifyUrgency`'s output schema and the final API response schema need the identical enum, and `lib/ai/schema.ts` is already established (Spec 05) as the shared-schema home.

## Scope

**In scope:**

- `lib/ai/schema.ts` (extend):
  - `DIRECTORY_CATEGORIES` — the 8 real category values (const array + zod enum), excluding `disclaimer`.
  - `DirectoryEntrySchema` — `{ category, name, area: string | null, contact: string | null, verified: 'true' | 'false' | 'name-only' }`, mirroring `database-schema.md`'s `directory_entries` columns.
  - `UrgencyClassificationSchema` — AI classifier output: `{ urgent: boolean, category: <DIRECTORY_CATEGORIES enum> | null, severity: 'high' | 'medium' | null, reasoning: string }`. `category`/`severity` null when `urgent` is false.
  - `EscalationResponseSchema` — `{ escalated: true, category: string, severity: 'high' | 'medium', message: string, matched_entries: DirectoryEntrySchema[] }`.
  - `ChatResponseSchema` (Spec 05) gets one added field: `escalated: z.literal(false)` — so the client can branch on `response.escalated` before knowing which shape it's holding, regardless of path.
- `lib/ai/prompts.ts` (extend): `buildClassifierSystemPrompt()` — encodes the classifier's job (decide if this single message describes a situation needing prompt in-person care, pick the best-matching category from the fixed list, pick severity), explicitly reusing hard invariant 2's constraints (the classifier itself must never diagnose — it only flags and categorizes) and a plain-language framing consistent with Amara's persona.
- `lib/ai/classify.ts` (new): `classifyUrgency(message: string): Promise<UrgencyClassification | null>` — same parse/validate/one-retry contract as `generateAnswer` (Spec 05 Decision 5), returns `null` after a second failure (Decision 8 above governs what the route does with that).
- `lib/directory/lookup.ts` (new):
  - `checkRedFlagKeywords(message: string): Promise<{ category: string, severity: 'high' | 'medium' } | null>` — fetches all `red_flag_rules` rows, case-insensitive substring-matches `pattern` against `message`, returns the first match's category/severity or `null`. (Ordering for multiple matches: table order / `id` ascending — first match wins; documented, not left implicit.)
  - `findDirectoryEntry(category: string): Promise<DirectoryEntry[]>` — queries `directory_entries` where `category` matches and `category != 'disclaimer'`, returns all matching rows (Decision 9).
- `app/api/services/route.ts` (new): `GET /api/services?category=<value>` — validates `category` against `DIRECTORY_CATEGORIES` (zod, local to the route, same pattern as the chat route's request validation), calls `findDirectoryEntry`, returns `{ entries: DirectoryEntry[] }` (200) or `{ error: ... }` (400 for missing/invalid category).
- `app/api/chat/route.ts` (modify): insert the classification step before the existing RAG flow —
  1. `Promise.all([checkRedFlagKeywords(message), classifyUrgency(message)])`.
  2. Combine per Decision 6; if urgent → `findDirectoryEntry(category)` → build and return `EscalationResponseSchema` JSON, HTTP 200. RAG path (`searchKb`/`generateAnswer`) is not reached.
  3. If not urgent → existing Spec 05 flow, unchanged except the response now includes `escalated: false`.

**Out of scope (do not build in this spec):**

- Any UI (`components/chat/EscalationCard.tsx` etc.) — Spec 07 builds this against mock data matching `EscalationResponseSchema`; Spec 08 wires it to this real endpoint.
- `simple_version` / `pidgin_version` fields on either response shape — Spec 09.
- Any change to `data/red_flag_rules.json` or `data/clinic_directory.json` — both are protected files per `ai-workflow-rules.md`; nothing here required editing them, only reading the tables they already loaded (Spec 04).
- Any mental-health-specific escalation copy or routing override — explicitly resolved against, see above.
- Verifying the two unverified phone numbers (Lagos emergency number, Federal Neuro-Psychiatric Hospital) — pre-demo checklist item in `SCOPE.md`, not this spec's job.

## Files to create / modify

- `lib/ai/schema.ts` (modify)
- `lib/ai/prompts.ts` (modify)
- `lib/ai/classify.ts` (new)
- `lib/directory/lookup.ts` (new)
- `app/api/services/route.ts` (new)
- `app/api/chat/route.ts` (modify)
- No `.env.example` changes — no new env vars needed, same OpenAI/Supabase credentials as Spec 05.

## Steps

1. Extend `lib/ai/schema.ts`: add `DIRECTORY_CATEGORIES`, `DirectoryEntrySchema`, `UrgencyClassificationSchema`, `EscalationResponseSchema`; add `escalated: z.literal(false)` to `ChatResponseSchema`.
2. Extend `lib/ai/prompts.ts`: add `buildClassifierSystemPrompt()`.
3. Write `lib/ai/classify.ts`: `classifyUrgency()` per Decision 8's contract.
4. Write `lib/directory/lookup.ts`: `checkRedFlagKeywords()` and `findDirectoryEntry()`.
5. Write `app/api/services/route.ts`.
6. Modify `app/api/chat/route.ts` to insert the classification/escalation branch ahead of the existing RAG flow, per Scope above.
7. Verify with `curl` against `npm run dev`:
   - A message containing an exact/near-exact red-flag phrase (e.g. "he is having a seizure or fit right now") → deterministic hit alone is enough → `escalated: true`, correct `category`/`severity`, `matched_entries` non-empty and traceable to real `directory_entries` rows — confirm this triggers even if the AI classifier call is mocked out or fails, proving Decision 8's degrade-gracefully path.
   - A paraphrased urgent message that would **not** substring-match any `red_flag_rules.pattern` (e.g. describing stroke symptoms in different words than id 23–26's exact phrasing) → confirm whether the AI classifier alone catches it; log which layer fired.
   - `category: 'emergency'` case specifically → confirm `matched_entries` returns both live rows (ambulance + national number), not just one.
   - A clearly non-urgent, in-KB question (e.g. malaria prevention) → `escalated: false`, falls through to the existing Spec 05 RAG path unchanged.
   - `GET /api/services?category=mental-health` → 200, one entry, `verified: "name-only"`. `GET /api/services?category=not-a-real-category` → 400. `GET /api/services` (no query param) → 400.
   - Malformed classifier output / classifier failure path: code-reviewed for correctness (same treatment Spec 05 gave its equivalent case), not force-reproduced live for the same reason — deferred to the Spec 11 test-set.

## New dependencies

None. Same SDKs as Spec 05 (`@anthropic-ai/sdk`, `@supabase/supabase-js`, `zod`) — no new package needed for keyword matching or the classifier call.

## Status: NOT STARTED

## Verify checklist

- [ ] `lib/ai/schema.ts`, `lib/ai/prompts.ts`, `lib/ai/classify.ts`, `lib/directory/lookup.ts`, `app/api/services/route.ts`, `app/api/chat/route.ts` written/modified
- [ ] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [ ] Exact-phrase red flag → `escalated: true` with correct category/severity and traceable `matched_entries`, verified live via curl
- [ ] `category: 'emergency'` returns both live directory rows in `matched_entries`
- [ ] Non-urgent in-KB question still returns the unchanged Spec 05 grounded-answer shape, now with `escalated: false`
- [ ] `GET /api/services` verified for a valid category, an invalid category (400), and a missing category (400)
- [ ] Deterministic check confirmed to work independent of the AI classifier (Decision 8's degrade path exercised, not just code-reviewed)
- [ ] No `SELECT *` anywhere; no Supabase import outside `lib/kb/`, `lib/directory/`, `app/api/*`
- [ ] No invariant in `architecture.md` or `code-standards.md` violated — in particular hard invariant 2 (no diagnosis/treatment plan — verify the escalation path never calls `generateAnswer`)
- [ ] `progress-tracker.md` updated: Spec 06 marked complete or left in progress per actual verification results; the mental-health open question marked resolved (link back to this spec); combining-logic and classifier-fallback decisions logged under Architecture Decisions

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete once verified; close the mental-health open question; log Decisions 1–12 above under Architecture Decisions; log actual curl verification results.
- `architecture.md` — no stack/boundary change; `GET /api/services` was already listed, now fulfilled.
- `database-schema.md` — no schema change; this spec only reads existing tables.
- No `app-flow.md`, `ui-context.md`, or `code-standards.md` changes anticipated — this spec implements what they already specify.
