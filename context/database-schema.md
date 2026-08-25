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

### `kb_chunks`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | uuid | PK | |
| source_id | uuid | FK → `kb_sources(id)` ON DELETE CASCADE | |
| content | text | not null | The chunked passage |
| embedding | vector(1536) | not null | pgvector column — dimension must match the chosen embedding model |
| chunk_index | int | not null | Order within the source |

Indexes: an ivfflat (or hnsw) index on `embedding` for similarity search; a btree index on `source_id`.

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

One function is worth adding: `match_kb_chunks(query_embedding vector, match_count int, min_similarity float)` — returns chunks above the similarity cutoff. Keeps the cutoff logic in the database, not scattered across application code. No triggers are required for the MVP.

## Storage

Not used. No file uploads in this MVP.

## Sensitive fields

None of these tables store personal or health data tied to an identity. `query_log`, if enabled, stores only aggregate/category data — never raw message text.
