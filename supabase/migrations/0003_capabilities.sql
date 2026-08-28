-- Capability router + healthcare preparation + service navigation
-- (context/specs/20-capability-router-and-navigation.md), 2026-08-28.
--
-- Additive only — 0001_init.sql and 0002_hybrid_search.sql are never edited
-- once applied (ai-workflow-rules.md's protected-files rule). No existing
-- table's existing columns, indexes, or functions are touched — kb_sources/
-- kb_chunks/match_kb_chunks_hybrid are completely untouched, protecting the
-- already-verified Health Education RAG path from any regression risk.

-- ---------------------------------------------------------------------------
-- directory_entries: service-level tagging, additive to the existing
-- escalation `category` column. A facility already routed to by category
-- (e.g. 'maternal-care') can now also be found by a general, non-emergency
-- service_navigation query (e.g. 'antenatal_care') without conflating the
-- two taxonomies. See context/database-schema.md and lib/directory/lookup.ts.
-- ---------------------------------------------------------------------------

alter table directory_entries
  add column services text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- preparation_checklists — Part 13's structured, non-vector-RAG preparation
-- guidance. One row per service, looked up by exact `service` match
-- (lib/preparation/lookup.ts), never by similarity search. Seeded from
-- data/preparation_checklists.json by scripts/seed-preparation.ts, the same
-- pattern scripts/seed-directory.ts already established for
-- data/clinic_directory.json.
-- ---------------------------------------------------------------------------

create table preparation_checklists (
  id                       uuid primary key default gen_random_uuid(),
  service                  text not null unique,
  title                    text not null,
  preparation_items        text[] not null,
  variability_note         text not null,
  source_type              text not null default 'team-authored',
  -- Honest default, not an unearned "approved" — see data/preparation_checklists.json's
  -- own notes and progress-tracker.md's Open Questions: this content is
  -- Claude-drafted and has not yet had a clinical review pass, the same
  -- standard already applied to red_flag_rules.json (which WAS reviewed) and
  -- the Pidgin refusal copy (which was NOT and says so).
  clinical_review_status   text not null default 'drafted_pending_clinical_review',
  review_date              date,
  created_at               timestamptz not null default now()
);

alter table preparation_checklists enable row level security;
-- Per context/database-schema.md's existing posture: RLS enabled, zero
-- policies granted to anon/authenticated — all reads go through the
-- server-side API route using the service role key, which bypasses RLS.
