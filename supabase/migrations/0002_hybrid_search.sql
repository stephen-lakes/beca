-- Spec 19 — Hybrid retrieval: Postgres full-text search alongside the
-- existing pgvector search, plus curated keyword metadata for query
-- expansion. See context/specs/19-hybrid-retrieval-fallback-diagnostics.md.
--
-- Additive only — 0001_init.sql is never edited once applied
-- (ai-workflow-rules.md's protected-files rule). match_kb_chunks (0001)
-- stays in place, unused from here on; lib/kb/search.ts switches to
-- match_kb_chunks_hybrid below.

-- ---------------------------------------------------------------------------
-- kb_chunks: full-text search column + index
-- ---------------------------------------------------------------------------

alter table kb_chunks
  add column content_tsv tsvector generated always as (to_tsvector('english', content)) stored;

create index idx_kb_chunks_content_tsv on kb_chunks using gin (content_tsv);

-- ---------------------------------------------------------------------------
-- kb_sources: curated keyword list, for query-expansion at request time
-- (populated from data/kb_topics.json's `keywords` field by scripts/ingest-kb.ts)
-- ---------------------------------------------------------------------------

alter table kb_sources
  add column keywords text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- match_kb_chunks_hybrid — vector search (existing behavior, priority
-- channel) unioned with a small keyword-search rescue for chunks the vector
-- search alone would miss or under-rank. Spec 19 Decision 2, confirmed
-- 2026-08-27: match_count = 8, with up to 3 of those reserved for
-- keyword-only rescues (chunks that pass the full-text search but did not
-- pass the vector `min_similarity` cutoff, and are not already among the
-- vector matches).
--
-- Simplification vs. the drafted spec text: this function reports
-- matched_via as exactly 'vector' or 'keyword' (not also 'both') — a chunk
-- that clears the vector threshold is already included via the vector
-- channel regardless of whether it also matches the keyword search, so a
-- third label would add diagnostic granularity without changing which rows
-- are returned or how many. Noted here rather than silently deviating from
-- the spec's wording.
-- ---------------------------------------------------------------------------

create or replace function match_kb_chunks_hybrid(
  query_embedding vector(1536),
  query_text text,
  match_count int,
  min_similarity float
)
returns table (
  id          uuid,
  source_id   uuid,
  content     text,
  chunk_index int,
  similarity  float,
  matched_via text
)
language sql
stable
as $$
  with vector_matches as (
    select
      kb_chunks.id,
      kb_chunks.source_id,
      kb_chunks.content,
      kb_chunks.chunk_index,
      1 - (kb_chunks.embedding <=> query_embedding) as similarity
    from kb_chunks
    where 1 - (kb_chunks.embedding <=> query_embedding) >= min_similarity
    order by kb_chunks.embedding <=> query_embedding
    limit greatest(match_count - 3, 1)
  ),
  keyword_rescue as (
    select
      kb_chunks.id,
      kb_chunks.source_id,
      kb_chunks.content,
      kb_chunks.chunk_index,
      1 - (kb_chunks.embedding <=> query_embedding) as similarity,
      ts_rank(kb_chunks.content_tsv, plainto_tsquery('english', query_text)) as rank
    from kb_chunks
    where kb_chunks.content_tsv @@ plainto_tsquery('english', query_text)
      and kb_chunks.id not in (select id from vector_matches)
    order by rank desc
    limit 3
  )
  select id, source_id, content, chunk_index, similarity, 'vector'::text as matched_via
  from vector_matches
  union all
  select id, source_id, content, chunk_index, similarity, 'keyword'::text as matched_via
  from keyword_rescue
  limit match_count;
$$;
