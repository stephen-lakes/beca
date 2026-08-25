-- Spec 02 — Supabase schema & migration
-- Grounded Navigator: kb_sources, kb_chunks, directory_entries, red_flag_rules
-- See context/database-schema.md for the source of truth this migration implements.
--
-- query_log is intentionally NOT created here — it is optional, off by
-- default, and deferred until the demo-metrics work later (see
-- context/specs/02-database-schema.md, Out of scope).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table kb_sources (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  category         text not null,
  source_name      text not null,
  source_url       text,
  red_flag_linked  boolean not null default false,
  created_at       timestamptz not null default now()
);

create table kb_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references kb_sources(id) on delete cascade,
  content      text not null,
  embedding    vector(1536) not null,
  chunk_index  int not null
);

create table directory_entries (
  id        uuid primary key default gen_random_uuid(),
  category  text not null,
  name      text not null,
  area      text,
  contact   text,
  verified  text default 'false'
);

create table red_flag_rules (
  id        uuid primary key default gen_random_uuid(),
  pattern   text not null,
  category  text not null,
  severity  text not null
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- btree on the FK for source -> chunks lookups
create index idx_kb_chunks_source_id on kb_chunks(source_id);

-- HNSW over ivfflat: chosen for this MVP's small corpus (12 WHO fact sheets,
-- likely well under a thousand chunks total). ivfflat's "lists" parameter is
-- tuned against row count and needs data present (plus ANALYZE) to build a
-- good index; at this scale that tuning has no real signal to work with.
-- HNSW needs no such parameter and gives accurate nearest-neighbour search
-- from the first row. Cosine ops to match the <=> operator used in
-- match_kb_chunks below.
create index idx_kb_chunks_embedding on kb_chunks
  using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
-- Per context/database-schema.md: RLS is enabled on every table, and no
-- policies are granted to anon or authenticated. All reads and writes go
-- through server-side API routes using the service role key, which bypasses
-- RLS entirely on Supabase-managed projects. Enabling RLS with zero
-- permissive policies is what enforces "deny all" for anon/authenticated —
-- there is no separate deny policy to write.

alter table kb_sources        enable row level security;
alter table kb_chunks         enable row level security;
alter table directory_entries enable row level security;
alter table red_flag_rules    enable row level security;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function match_kb_chunks(
  query_embedding vector(1536),
  match_count int,
  min_similarity float
)
returns table (
  id          uuid,
  source_id   uuid,
  content     text,
  chunk_index int,
  similarity  float
)
language sql
stable
as $$
  select
    kb_chunks.id,
    kb_chunks.source_id,
    kb_chunks.content,
    kb_chunks.chunk_index,
    1 - (kb_chunks.embedding <=> query_embedding) as similarity
  from kb_chunks
  where 1 - (kb_chunks.embedding <=> query_embedding) >= min_similarity
  order by kb_chunks.embedding <=> query_embedding
  limit match_count;
$$;
