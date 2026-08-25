# Spec 02 — Supabase schema & migration

## Goal

Stand up all tables in `database-schema.md`, the pgvector extension, the `match_kb_chunks` function, and RLS on every table — a runnable, verified migration against the real Supabase project. Nothing is ingestible or queryable (Specs 03–06) until this exists.

## Depends on

Spec 01 (project scaffold — done; live at https://beca-self.vercel.app/).

## Scope

**In scope (pulled directly from `context/database-schema.md` — not re-derived):**

- `kb_sources`

  | Column | Type | Constraints | Purpose |
  |---|---|---|---|
  | id | uuid | PK, default `gen_random_uuid()` | |
  | title | text | not null | Topic title — matches `data/kb_topics.json` |
  | category | text | not null | e.g. `"maternal-care"` |
  | source_name | text | not null | `"WHO"` or `"internally authored"` |
  | source_url | text | nullable | Null only for internally authored content |
  | red_flag_linked | boolean | not null, default false | Pairs with `red_flag_rules` |
  | created_at | timestamptz | default `now()` | |

- `kb_chunks`

  | Column | Type | Constraints | Purpose |
  |---|---|---|---|
  | id | uuid | PK | |
  | source_id | uuid | FK → `kb_sources(id)` ON DELETE CASCADE | |
  | content | text | not null | The chunked passage |
  | embedding | vector(1536) | not null | pgvector column — dimension must match the chosen embedding model |
  | chunk_index | int | not null | Order within the source |

  Indexes: an ivfflat (or hnsw) index on `embedding` for similarity search; a btree index on `source_id`.

- `directory_entries`

  | Column | Type | Constraints | Purpose |
  |---|---|---|---|
  | id | uuid | PK | |
  | category | text | not null | Matches escalation categories |
  | name | text | not null | |
  | area | text | nullable | |
  | contact | text | nullable | Marked unverified until confirmed — see `data/clinic_directory.json` |
  | verified | text | default `'false'` | `'true'` / `'false'` / `'name-only'` |

- `red_flag_rules`

  | Column | Type | Constraints | Purpose |
  |---|---|---|---|
  | id | uuid | PK | |
  | pattern | text | not null | Keyword or simple pattern |
  | category | text | not null | Links to a `directory_entries` category |
  | severity | text | not null | `"high"` / `"medium"` |

- Table relationship: `kb_chunks.source_id` → `kb_sources.id`, `ON DELETE CASCADE`.
- RLS policies: "RLS is enabled on every table. No policies are granted to the `anon` role. All reads and writes go through server-side API routes using the service role key. Default posture: deny all for `anon` and `authenticated`." (verbatim, `database-schema.md`)
- Function: `match_kb_chunks(query_embedding vector, match_count int, min_similarity float)` — returns chunks above the similarity cutoff.
- Indexes per `database-schema.md`.

**Out of scope (do not build in this spec):**

- `query_log` — optional, off by default, not needed until the demo-metrics work later. Explicitly excluded from this migration by instruction.
- Any data loading — ingesting KB content (Spec 03) or the directory/red-flag seed (Spec 04).
- `lib/kb/`, `lib/directory/`, or any application code that queries these tables (Spec 05+).
- Storage buckets — not used anywhere in this MVP per `database-schema.md`.

## Files to create / modify

- `supabase/migrations/0001_init.sql` — the entire schema in one migration: pgvector extension, all 4 tables, indexes, RLS enablement + policies, `match_kb_chunks` function.
- No application code changes — this spec is pure database.

## Steps

1. Write `supabase/migrations/0001_init.sql`:
   - `CREATE EXTENSION IF NOT EXISTS vector;` (pgvector).
   - `CREATE TABLE kb_sources`, `kb_chunks`, `directory_entries`, `red_flag_rules` exactly per the column tables above.
   - `CREATE INDEX` — ivfflat (or hnsw) on `kb_chunks.embedding`, btree on `kb_chunks.source_id`.
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` on all four tables.
   - No `CREATE POLICY` granting `anon` or `authenticated` access on any table — deny-all is the default posture once RLS is enabled and no permissive policy exists, so this is satisfied by omission, not by an explicit deny policy (there is nothing else to write here per the invariant).
   - `CREATE FUNCTION match_kb_chunks(query_embedding vector(1536), match_count int, min_similarity float) RETURNS TABLE(...)` — returns chunks above the similarity cutoff, ordered by similarity.
2. Run the migration against the real Supabase project (direct Postgres connection — service role key alone can't execute DDL).
3. Verify against the live database:
   - All 4 tables exist with the correct columns/types.
   - `relrowsecurity = true` (RLS enabled) on all 4 tables via `pg_class`.
   - No policies exist granting `anon`/`authenticated` (`pg_policies` empty for these tables, or explicitly deny-only).
   - `match_kb_chunks` function exists and is callable.
   - pgvector extension is installed.

## New dependencies

- `pgvector` Postgres extension — required for `kb_chunks.embedding` and `match_kb_chunks`; enabled via `CREATE EXTENSION` in the migration itself, not an npm dependency.
- No new npm dependencies for this spec (a DB connection script for running/verifying the migration is a one-off dev-time tool, not a persisted app dependency — if `pg` is needed for that, remove it after verification unless a later spec needs it too).

## Verify checklist

- [x] `supabase/migrations/0001_init.sql` written, covers all 4 in-scope tables + indexes + RLS + function
- [x] `query_log` NOT created (explicitly deferred)
- [x] Migration actually run against the real Supabase project (not just written) — via the Supabase connection pooler (direct `db.*.supabase.co` host is IPv6-only and unreachable from the build sandbox)
- [x] All 4 tables confirmed to exist in the live database, columns/types match `database-schema.md` exactly
- [x] RLS confirmed enabled (`relrowsecurity = true`) on all 4 tables in the live database
- [x] No `anon`/`authenticated` policies present on any of the 4 tables (0 rows in `pg_policies`)
- [x] `match_kb_chunks` function confirmed present and callable in the live database (smoke-tested with a zero vector, 0 rows returned as expected on an empty table)
- [x] pgvector extension confirmed installed (v0.8.2)
- [x] No invariant in `architecture.md` or `code-standards.md` violated
- [x] `progress-tracker.md` updated: Spec 02 marked complete, Spec 03 marked in progress

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete, log any deviation from `database-schema.md` discovered while writing SQL (e.g. exact index type chosen — ivfflat vs hnsw — and why)
- `database-schema.md` — only if implementation forced a column/type/constraint change from what's documented
