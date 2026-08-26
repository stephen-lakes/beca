# Spec 03 — KB ingestion script

## Goal

Build `scripts/ingest-kb.ts`: fetch the 12 WHO fact-sheet topics in `data/kb_topics.json`, chunk each into passages, embed each chunk, and store one row per topic in `kb_sources` and one row per chunk in `kb_chunks` — against the real Supabase project, verified live. Nothing is retrievable (Spec 05) until this exists.

## Depends on

Spec 02 (Supabase schema & migration — done; all 4 tables, RLS, `match_kb_chunks`, pgvector live).

## Decisions (resolved before implementation)

Both previously-blocking open questions (see `progress-tracker.md` Architecture Decisions for full reasoning) are now resolved:

1. **Embedding provider/model: OpenAI `text-embedding-3-small`.** Outputs 1536 dimensions natively — an exact match to `kb_chunks.embedding vector(1536)` (`database-schema.md`, applied in Spec 02), no config or schema change needed. Anthropic has no embeddings endpoint, so generation/classification stay on Anthropic Claude throughout while embeddings alone come from OpenAI. New env var: `OPENAI_API_KEY`.
2. **Chunking strategy: fixed-size token window with overlap.** ~400 tokens per chunk, ~50 token overlap between consecutive chunks within a source, tokenized with `cl100k_base` (the encoding `text-embedding-3-small` uses) via the `gpt-tokenizer` package, so "tokens" means what the embedding model actually sees. `chunk_index` starts at 0 per source.

**Non-blocking risk, accepted as-is:** WHO fact-sheet pages are ordinary HTML, not a stable API. The script fetches with a browser-like `User-Agent`, extracts the main article container with `cheerio`, and fails loudly per-topic (log + skip, continue with the rest) rather than silently storing empty/boilerplate content. No cross-run HTML cache or manual-paste fallback for the MVP — acceptable since this is a one-off dev-time script, not request-time code.

## Scope

**In scope:**

- `scripts/ingest-kb.ts` — a one-off script (per `architecture.md`: "the only thing that fetches from who.int. It never runs at request time — the KB is pre-ingested, not live-fetched on each chat turn"):
  - Read all 12 entries from `data/kb_topics.json`.
  - For each entry with a `source_url` (11 of 12 — topic #12 is `"internally authored"`, `source_url: null`): fetch the WHO fact-sheet page and extract the main article text, discarding site navigation/boilerplate.
  - For topic #12: use hand-written checklist content authored for this spec (per `kb_topics.json`'s note: "write this ourselves as a short checklist and label it clearly as team-authored in the UI, not a cited external fact") — no fetch involved.
  - Insert one row per topic into `kb_sources` (`title`, `category`, `source_name`, `source_url`, `red_flag_linked` — all taken directly from `kb_topics.json`).
  - Chunk each topic's extracted/authored text into passages: fixed-size ~400-token windows with ~50-token overlap, `cl100k_base` tokenization via `gpt-tokenizer`.
  - Generate an embedding for each chunk via OpenAI `text-embedding-3-small` (1536 dims).
  - Insert one row per chunk into `kb_chunks` (`source_id`, `content`, `embedding`, `chunk_index`).
  - Script is safely re-runnable (e.g. clears prior rows for a topic, or the whole table, before re-inserting) since it's a one-shot dev-time tool, not idempotent-by-upsert application code.

**Out of scope (do not build in this spec):**

- `lib/kb/search.ts` or any runtime retrieval code — `lib/kb/` is "runtime retrieval only" (`architecture.md`) and "nothing but knowledge-base retrieval" (`code-standards.md`); ingestion logic does not belong there and stays in `scripts/`.
- `data/clinic_directory.json` or `red_flag_rules` loading (Spec 04).
- Any API route, UI component, or `lib/ai/` prompt/classification code.
- `query_log` — not created until later, per Spec 02.
- Editing `data/kb_topics.json` itself — it's a protected file per `ai-workflow-rules.md`; only the ingestion script's fetch/handling logic changes, never the generated-from source list by hand.

## Files to create / modify

- `scripts/ingest-kb.ts` — the entire ingestion pipeline (fetch → extract → chunk → embed → store), matching the single file named in `architecture.md`'s folder structure.
- `.env.example` / `.env.local` — add `OPENAI_API_KEY`; no Supabase or Anthropic variables change.
- `architecture.md` — resolve the embeddings row's "Open decision" callout with the OpenAI choice (done alongside this spec).
- No changes to `app/`, `components/`, `lib/ai/`, `lib/kb/`, or `supabase/migrations/*`.

## Steps

1. Write `scripts/ingest-kb.ts`:
   - Load and validate `data/kb_topics.json` (zod schema, per `code-standards.md`'s "validate all external input" rule).
   - For each of the 11 WHO-sourced topics: fetch `source_url`, extract main content text.
   - For topic #12: use the hand-authored checklist text.
   - Insert the `kb_sources` row for each topic, capturing the returned `id`.
   - Chunk the topic's text per the resolved chunking strategy, preserving order for `chunk_index`.
   - Call the resolved embedding provider for each chunk.
   - Insert `kb_chunks` rows (`source_id`, `content`, `embedding`, `chunk_index`) via a Supabase client instantiated directly inside the script (service-role key from env) — self-contained rather than reusing `lib/supabase/`, since that module doesn't exist yet and is reserved for the running app's server-only client, built later (Spec 05+); keeps this spec inside the `scripts/` boundary only.
   - Log progress per topic (fetched / chunked / embedded / stored) to the console — this is a dev-time script, not a `console.log`-in-production violation of `code-standards.md`.
2. Run the script against the real Supabase project.
3. Verify against the live database:
   - Exactly 12 rows in `kb_sources`, one per `kb_topics.json` entry, fields matching exactly.
   - `kb_chunks` has ≥1 row per source, `chunk_index` ordered correctly from 0 within each source, `embedding` populated (not null) on every row.
   - Spot-check 2–3 chunks' `content` against the source fact sheet to confirm extraction didn't capture navigation/boilerplate text.
   - `match_kb_chunks` (from Spec 02) returns non-empty, plausible results for a manually-embedded test query.

## New dependencies

- `tsx` (dev dependency) — script runner for executing `scripts/ingest-kb.ts` directly outside the Next.js build; it's a standalone Node script, not a Next.js route or component.
- `cheerio` — HTML parsing, needed to extract main article text from WHO fact-sheet pages and discard site chrome/navigation.
- `openai` — official SDK for the `text-embedding-3-small` embedding calls (see Decisions above).
- `gpt-tokenizer` — pure-JS `cl100k_base` tokenizer, needed so the fixed-size chunking window is measured in the same tokens the embedding model sees, not an approximation.

## Verify checklist

- [x] `scripts/ingest-kb.ts` written, covers all 12 topics (11 fetched + 1 authored)
- [x] Script run against the real Supabase project (not just written) — required an OpenAI billing/payment-method fix mid-session after the first run hit `429 quota exceeded` on every topic; script failed loudly and safely (0 rows written, no partial state) rather than storing anything, then succeeded cleanly on re-run
- [x] `kb_sources` has exactly 12 rows, fields match `data/kb_topics.json` exactly — verified live (title/category/source_name/source_url/red_flag_linked spot-checked against the JSON for all 12)
- [x] `kb_chunks` has ≥1 row per source, `chunk_index` correctly ordered, `embedding` non-null on every row, dimension matches `vector(1536)` — verified live: 69 rows total (per-source: 7,7,7,5,8,13,4,5,3,4,5,1), ordering correct for every source, 0 null embeddings, all embeddings exactly 1536 dims
- [x] Spot-checked chunk content against source pages — no nav/boilerplate captured (malaria chunk 0 matches the live WHO page's "Key facts" section verbatim)
- [x] `match_kb_chunks` smoke-tested with a real (non-zero) embedded query, returns plausible results — query "What are the symptoms of malaria in a child and when should I worry?" returned 3 malaria-source chunks ranked by similarity (0.5475 / 0.4990 / 0.4867)
- [x] No invariant in `architecture.md` or `code-standards.md` violated
- [x] No new npm dependency added without a one-line reason recorded in this file (see New dependencies)
- [x] `progress-tracker.md` updated: Spec 03 marked complete, Spec 04 marked in progress

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete, note actual row counts from the live verification
- `architecture.md`, `.env.example` — already updated alongside this spec (embeddings row, `OPENAI_API_KEY`)
