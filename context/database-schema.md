# Database Schema

## Auth architecture

None. No `auth.users` table is used by the application. Supabase's built-in auth is not enabled for end users — see `architecture.md`'s Auth model.

## Tables

### `kb_sources`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | uuid | PK, default `gen_random_uuid()` | |
| title | text | not null | Topic title — matches `data/kb_topics.json` |
| category | text | not null | e.g. `"maternal-care"` |
| source_name | text | not null | `"WHO"` or `"internally authored"` |
| source_url | text | nullable | Null only for internally authored content |
| red_flag_linked | boolean | not null, default false | Pairs with `red_flag_rules` |
| created_at | timestamptz | default `now()` | |
| keywords | text[] | not null, default `'{}'` | Spec 19 — curated per-topic keywords from `data/kb_topics.json`, persisted by `scripts/ingest-kb.ts`. Used at query time by `lib/kb/search.ts` for bounded keyword-search expansion — never LLM-generated. |

### `kb_chunks`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | uuid | PK | |
| source_id | uuid | FK → `kb_sources(id)` ON DELETE CASCADE | |
| content | text | not null | The chunked passage |
| embedding | vector(1536) | not null | pgvector column — dimension must match the chosen embedding model |
| chunk_index | int | not null | Order within the source |
| content_tsv | tsvector | generated always as `to_tsvector('english', content)`, stored | Spec 19 — full-text-search column backing the keyword-retrieval channel in `match_kb_chunks_hybrid`. |

Indexes: an ivfflat (or hnsw) index on `embedding` for similarity search; a btree index on `source_id`; a GIN index on `content_tsv` (Spec 19, `idx_kb_chunks_content_tsv`).

### `directory_entries`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | uuid | PK | |
| category | text | not null | Matches escalation categories |
| name | text | not null | |
| area | text | nullable | |
| contact | text | nullable | Marked unverified until confirmed — see `data/clinic_directory.json` |
| verified | text | default `'false'` | `'true'` / `'false'` / `'name-only'` |

### `red_flag_rules`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | uuid | PK | |
| pattern | text | not null | Keyword or simple pattern |
| category | text | not null | Links to a `directory_entries` category |
| severity | text | not null | `"high"` / `"medium"` |

### `query_log` (optional, off by default)

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | uuid | PK | |
| created_at | timestamptz | default `now()` | |
| category | text | not null | `grounded` / `refused` / `escalated` |
| response_ms | int | nullable | |
| similarity_score | float | nullable | |

No raw user message text is ever written to `query_log` — this table exists only to populate the demo's impact-metrics panel.

## Table relationships

`kb_chunks.source_id` → `kb_sources.id`, `ON DELETE CASCADE` (deleting a source removes its chunks).

## RLS policies

RLS is enabled on every table. No policies are granted to the `anon` role. All reads and writes go through server-side API routes using the service role key. Default posture: deny all for `anon` and `authenticated`.

## Functions / triggers

`match_kb_chunks(query_embedding vector, match_count int, min_similarity float)` — the original Spec 02 function. Still present in the database but **no longer called by the running app** as of Spec 19 (kept, not dropped — dropping a function isn't in the additive spirit this project's migrations otherwise follow).

`match_kb_chunks_hybrid(query_embedding vector, query_text text, match_count int, min_similarity float)` — Spec 19, the function `lib/kb/search.ts` actually calls now. Unions the same vector-similarity search as `match_kb_chunks` with a Postgres full-text-search rescue: chunks that satisfy `content_tsv @@ plainto_tsquery('english', query_text)` but fall below the vector `min_similarity` cutoff are still included, up to 3 of the total `match_count` (confirmed at 8). Returns a `matched_via` column (`'vector'` / `'keyword'`), consumed only for diagnostic logging in `app/api/chat/route.ts`, never shown to the user or the model. See `supabase/migrations/0002_hybrid_search.sql` and `context/specs/19-hybrid-retrieval-fallback-diagnostics.md`.

No triggers are required for the MVP.

## Storage

Not used. No file uploads in this MVP.

## Sensitive fields

None of these tables store personal or health data tied to an identity. `query_log`, if enabled, stores only aggregate/category data — never raw message text.
