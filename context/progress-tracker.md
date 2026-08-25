# Progress Tracker

Update this file after every spec implementation.

## Current Phase

Phase 1 — Backend foundation (Supabase schema, KB ingestion, directory seed).

## Current Goal

`scripts/ingest-kb.ts` — fetch the 12 WHO fact sheets, chunk, embed, store in `kb_sources`/`kb_chunks` (Spec 03's scope).

## Completed

- H0–2: scope locked (`SCOPE.md`), KB topic list finalized, directory seed drafted.
- Project structure and context-file system defined (this file set).
- Spec 01: Project setup & deploy shell (see `context/specs/01-project-setup.md`) — Next.js/TypeScript/Tailwind v4/shadcn scaffold, color tokens wired into `app/globals.css`, empty page. Deployed live: **https://beca-self.vercel.app/**. H2–4 "done" criteria met.
- Spec 02: Supabase schema & migration (see `context/specs/02-database-schema.md`) — `supabase/migrations/0001_init.sql` written and **run against the real Supabase project**, verified live: all 4 tables (`kb_sources`, `kb_chunks`, `directory_entries`, `red_flag_rules`) present with correct columns/types, RLS enabled on all 4 with zero `anon`/`authenticated` policies, pgvector v0.8.2 installed, `idx_kb_chunks_source_id` (btree) + `idx_kb_chunks_embedding` (HNSW cosine) present, `match_kb_chunks` present and smoke-tested. `query_log` deliberately not created (deferred).

## In Progress

- Spec 03: KB ingestion script (see `context/specs/00-build-plan.md` unit 03)

## Next Up

- Spec 04: Directory seed load
- Spec 05: RAG retrieval + chat API (no classifier yet)

## Open Questions

- Which real Lagos neighbourhood/PHC to use for `clinic_directory.json` entries #5, #6, #7, #10 — currently placeholders.
- Whether the Lagos/Nigeria emergency number is verified — not yet confirmed, see `SCOPE.md`.
- `.gitignore`'s blanket `.env*` pattern also excludes `.env.example`, so it's never committed to the repo. Surfaced during Spec 01 but out of that spec's scope to fix. Needs a decision before Spec 02–03 land Supabase/Anthropic env vars: either add a `!.env.example` negation line, or accept documenting required env vars elsewhere (e.g. `architecture.md`).
- **Action needed from the user:** the real Supabase DB password was found pasted as a bare stray line in `.env.example` (a template file meant to hold empty values only) — fixed in the file, but the password itself was live in plaintext outside where a secret should ever sit. Never committed to git, but recommend rotating it anyway (Supabase dashboard → Database → Reset database password), then updating `SUPABASE_DB_URL` in `.env.local` with the new one.

## Architecture Decisions

- WHO fact sheets chosen as the sole approved source for the MVP (not NCDC or Lagos State Ministry of Health) — driven by ingestion feasibility at hackathon speed. See `architecture.md`.
- Nigerian Pidgin chosen as the single second-language mode — satisfies both the "multiple languages" and "simplified communication" brief bullets with one feature.
- No end-user auth, by design — matches the brief's privacy emphasis and the do-not-build list.
- AI provider confirmed: Anthropic Claude (Claude Sonnet 5). lib/ai/client.ts targets the Anthropic SDK; ANTHROPIC_API_KEY is the only provider key in .env.example/.env.local. $20 in Anthropic Console usage credits purchased, sized for dev/testing iteration plus the live judged demo (est. ~$0.02/conversation turn at Sonnet 5 pricing — see cost notes from Claude, Aug 2026).
- Tailwind CSS v4 confirmed (already scaffolded in the initial commit, along with Next.js 16.3.2 and shadcn/ui — ahead of Spec 01 being formally written). Tailwind v4 is CSS-first config with no `tailwind.config.ts`; theme values live in an `@theme` block in `app/globals.css`. `ui-context.md` and `code-standards.md` originally said "tailwind.config.ts" (a v3 assumption) — corrected both to point at `app/globals.css`'s `@theme` block instead. User confirmed this direction over creating a `tailwind.config.ts` + `@config` shim.
- `ui-context.md`'s teal interactive-color token renamed from `accent` to `brand` — shadcn/ui already reserves `--accent` internally as a neutral hover-background token used by every generated primitive; reusing the name would cause one value to silently clobber the other in the CSS `@theme` block. User confirmed renaming the brand token rather than overriding shadcn's `--accent`. Use `bg-brand` / `text-brand` / `border-brand` in components going forward, not `accent`.
- HNSW chosen over ivfflat for `kb_chunks.embedding`'s similarity index (`database-schema.md` left this open — "ivfflat (or hnsw)"). This MVP's corpus is 12 WHO fact sheets, likely well under a thousand chunks; ivfflat's `lists` parameter is tuned against row count and needs data present (plus `ANALYZE`) to build a good index, which has no real signal at this scale. HNSW needs no such tuning and gives accurate search from the first row. Uses `vector_cosine_ops` to match the `<=>` operator in `match_kb_chunks`.
- Direct Postgres connections to Supabase (`db.<ref>.supabase.co`) are IPv6-only (no `A` record) and unreachable from this build sandbox's network. Migrations must run through the **Session mode connection pooler** (`aws-*.pooler.supabase.com`, port 5432) instead — this is Supabase's own documented fix for IPv4-only environments, not a workaround. In practice the migration also succeeded through the Transaction-mode pooler (port 6543) for this single-shot multi-statement DDL run, but Session mode is still the one to reach for by default — Transaction mode's per-statement connection multiplexing is not guaranteed to hold up for more complex future migrations.

## Session Notes

Read `SCOPE.md` and the "Grounded Navigator" strategy document for full product/judging context before starting Spec 01 — this tracker assumes that context is already known and does not repeat it.

- 2026-08-25: `CLAUDE.md` was missing a formal pointer to `SCOPE.md` and `context/specs/00-build-plan.md` — both were referenced repeatedly elsewhere but not listed as required reading. Added a "Before starting any spec" section to `CLAUDE.md` covering both files.
- 2026-08-25: Reconciled `.env.local` with `architecture.md`/`.env.example`'s documented Supabase variable names. It had drifted to `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase's default client-side quickstart snippet — wrong shape for this app's server-only design). Renamed to plain `SUPABASE_URL`, dropped the unused publishable key entirely, and fixed a real bug in the URL value itself: it had `/rest/v1/` baked into it, which would have double-appended once `lib/supabase/client.ts` (Spec 05) called `createClient()` — the client library adds that path itself. Also added `SUPABASE_DB_URL` to `.env.example` (it was already required by Spec 02 but never documented there) with a comment steering toward the Session-mode pooler string, not the unreachable direct `db.*.supabase.co` host. `.env.example`'s stray leaked-password line (see Open Questions) was removed in the same pass.
