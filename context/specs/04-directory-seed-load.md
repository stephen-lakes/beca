# Spec 04 — Directory seed load

## Goal

Load `data/clinic_directory.json` into `directory_entries`, and the red-flag keyword list into `red_flag_rules` — against the real Supabase project, verified live. Escalation matching (Spec 06) has nothing to match against until this exists.

## Depends on

Spec 02 (Supabase schema & migration — done; `directory_entries` and `red_flag_rules` tables, RLS, live).

## Status: COMPLETE

Both halves are implemented and verified live. (Original blocking note on `red_flag_rules` — no source file existed — is preserved below for context; it was resolved by drafting `data/red_flag_rules.json` for review, per `progress-tracker.md`'s Architecture Decisions.)

- `architecture.md`'s documented `data/` folder only lists `kb_topics.json` and `clinic_directory.json` — there is no third file for red-flag keywords.
- `context/specs/00-build-plan.md` unit 04 assumes a "red-flag keyword list" already exists to load, the same way `SCOPE.md`'s H0–2 checklist says the KB topic list and directory seed were "drafted" ahead of implementation — but no equivalent drafting happened for red-flag patterns. A repo search confirms it: nothing named `red_flag` or similar exists outside `database-schema.md`'s column definitions.
- `database-schema.md` defines the *shape* (`pattern`, `category`, `severity`) but not one row of actual content — which keywords, which severities, which categories.

Per `ai-workflow-rules.md`: this is not guessed here. Red-flag patterns are the direct input to the escalation branch (Spec 06) — deciding what counts as "high" vs "medium" severity, and what keyword/phrase triggers an escalation at all, is a safety-relevant clinical/product judgment call, explicitly called out in `ai-workflow-rules.md` as something to stop and ask about rather than invent. `ai-workflow-rules.md`'s "Protected files" section also treats `data/kb_topics.json` and `data/clinic_directory.json` as hand-authored source lists, edited by hand rather than generated — the same convention should apply to a new `data/red_flag_rules.json`, so it isn't something to freehand on the project owner's behalf either.

**This needs a decision before the red_flag_rules half can be implemented:** either the project owner hand-authors `data/red_flag_rules.json` (matching the convention of the other two seed files), or explicitly asks for a draft candidate list to review and edit — not for direct insertion. Logged in `progress-tracker.md`'s Open Questions.

## Scope

**In scope — `directory_entries` load (ready):**

- `data/clinic_directory.json` → `directory_entries`, field mapping:
  - `category`, `name`, `area`, `contact` map directly.
  - JSON's `id` (1–12, a plain sequence for human reference in the seed file) is **not** inserted — `directory_entries.id` is a DB-generated `uuid`.
  - `verified`: the JSON mixes a boolean `false` and strings `"name-only"` / `"n/a"`, but `database-schema.md` defines the column as text restricted to `'true'` / `'false'` / `'name-only'`. Mapping: JSON boolean `false` → string `'false'`; JSON `"name-only"` → `'name-only'` unchanged. No entry in the current seed is `true` yet — consistent with `SCOPE.md`'s "Known unverified items," nothing has been confirmed.
  - Entry **#12 ("Directory scope note", category `"disclaimer"`) is excluded from the load.** It isn't a real clinic/service entry — it's a scope caveat for the pitch ("this is a 12-entry hackathon-scale seed, not comprehensive"), already captured in `SCOPE.md`. Inserting it as a `directory_entries` row would put a non-clinic row in a table `red_flag_rules`/escalation logic expects to contain only real, categorizable service entries. Result: **11 rows loaded**, not 12.
  - Entries #5, #6, #7, #10, #11 still contain placeholder text (e.g. `"[Nearest Lagos State Primary Health Centre to your chosen demo neighbourhood]"`, `"FILL IN"`) — loaded verbatim, `verified: 'false'` accurately reflects that. This is the same gap already tracked in `progress-tracker.md`'s Open Questions ("Which real Lagos neighbourhood/PHC..."), not a new one — loading now with an honest `verified` status doesn't require that question to be resolved first, but it must be before the live demo, per `SCOPE.md`.

**In scope — `red_flag_rules` load (complete):**

- `data/red_flag_rules.json` → `red_flag_rules`, field mapping: `pattern`, `category`, `severity` map directly; `id`, `taxonomy_category`, `notes` are review/traceability metadata only, stripped by the loader (same convention as `kb_topics.json`'s `notes` field).
- Drafted by Claude (67 rows across a 14-category clinical taxonomy — Airway/Breathing/Circulation/Neurological/Cardiac/Stroke/Severe infection/Poisoning/Trauma/Allergic reaction/Pregnancy-postpartum/Children/Mental health/Other acute deterioration), reviewed by the project owner, and approved unedited — including its two flagged judgment calls (severe pregnancy danger signs → `category: 'emergency'`; imminent self-harm risk → `category: 'mental-health'`, flagged for different escalation copy/handling in Spec 06). See `progress-tracker.md` Architecture Decisions for the full resolution.

**Out of scope (do not build in this spec):**

- Any escalation-matching logic that reads `directory_entries`/`red_flag_rules` at request time — that's `lib/directory/lookup.ts` (Spec 06+), not this one-off seed script.
- Any API route, UI component, or `lib/ai/` code.
- Editing `data/clinic_directory.json` itself — protected file per `ai-workflow-rules.md`; only the loader script's handling of it changes.
- Resolving the placeholder entries (#5, #6, #7, #10, #11) or verifying contact details — tracked separately in `progress-tracker.md`'s Open Questions, due before the live demo, not before this spec.

## Files to create / modify

- `scripts/seed-directory.ts` — new one-off loader script, sibling to `scripts/ingest-kb.ts`. Loads both `directory_entries` and `red_flag_rules`.
- `architecture.md` — add `scripts/seed-directory.ts` to the documented folder structure (currently only lists `ingest-kb.ts` under `scripts/`).
- No changes to `app/`, `components/`, `lib/ai/`, `lib/kb/`, `lib/directory/`, or `supabase/migrations/*`.

## Steps

1. Write `scripts/seed-directory.ts`:
   - Load and validate `data/clinic_directory.json` (zod schema — `code-standards.md`'s "validate all external input" rule), matching the JSON's actual shape (`verified` as `boolean | 'name-only' | 'n/a'`, not yet the DB's string enum).
   - Filter out entry #12 (`category === "disclaimer"`).
   - Map each remaining entry to a `directory_entries` row per the field mapping above.
   - Clear existing `directory_entries` rows before inserting (re-runnable dev-time script, same convention as `ingest-kb.ts` — not idempotent-by-upsert application code).
   - Insert the 11 rows via a Supabase client instantiated directly in the script (service-role key from env), same self-contained pattern as `ingest-kb.ts` — `lib/supabase/` still doesn't exist yet.
   - Log progress per row to the console.
2. Run the script against the real Supabase project.
3. Verify against the live database:
   - `directory_entries` has exactly 11 rows (12 minus the excluded disclaimer entry).
   - Every row's `category`, `name`, `area`, `contact` match `data/clinic_directory.json` exactly (placeholder text included, verbatim).
   - Every row's `verified` is one of `'true'` / `'false'` / `'name-only'` — confirms the boolean→string mapping landed correctly, no raw `false` (boolean) or `"n/a"` leaked into the column.
4. Write the `red_flag_rules` loading step in the same script (`seedRedFlagRules`), reading `data/red_flag_rules.json`, stripping the review-only `id`/`taxonomy_category`/`notes` fields, inserting `pattern`/`category`/`severity`.
5. Run the full script again (both steps run in one invocation).
6. Verify against the live database:
   - `red_flag_rules` has exactly 67 rows (matching `data/red_flag_rules.json`'s row count).
   - Every row's `category` and `severity` are valid values, and every distinct `category` used has at least one matching live `directory_entries` row (cross-checked, not assumed).
   - Spot-checked a handful of rows (including both flagged-judgment-call rows) against the source file.

## New dependencies

None. Reuses `@supabase/supabase-js` and `zod` (already dependencies) and `tsx` (already a dev dependency, added in Spec 03) — this script has no fetch/chunk/embed pipeline, so none of Spec 03's other new dependencies (`cheerio`, `openai`, `gpt-tokenizer`) are needed here.

## Verify checklist

- [x] `scripts/seed-directory.ts` written, loads `directory_entries` only (per Status, `red_flag_rules` is out for this pass)
- [x] Script run against the real Supabase project (not just written)
- [x] `directory_entries` has exactly 11 rows, fields match `data/clinic_directory.json` exactly (entry #12 correctly excluded)
- [x] Every row's `verified` value is a valid string (`'true'` / `'false'` / `'name-only'`) — no boolean or `'n/a'` leaked through — verified live, all 11 rows valid
- [x] `red_flag_rules` decision resolved and recorded in `progress-tracker.md` (Architecture Decisions) — draft (`data/red_flag_rules.json`, 67 rows) reviewed by the project owner and approved unedited, including both flagged judgment calls
- [x] `red_flag_rules` loading step written, script run against the real Supabase project
- [x] `red_flag_rules` has exactly 67 rows, all `category`/`severity` values valid, every used category has a matching live `directory_entries` row
- [x] No invariant in `architecture.md` or `code-standards.md` violated
- [x] No new npm dependency added without a one-line reason recorded in this file (see New dependencies — none needed)
- [x] `progress-tracker.md` updated: both halves logged, Spec 04 marked "Completed," Spec 05 marked "In Progress"

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — log the live `directory_entries` verification results; keep the red_flag_rules gap as an open item until resolved
- `architecture.md` — add `scripts/seed-directory.ts` to the folder structure
