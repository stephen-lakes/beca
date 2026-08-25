# Progress Tracker

Update this file after every spec implementation.

## Current Phase

Phase 1 — Backend foundation (Supabase schema, KB ingestion, directory seed).

## Current Goal

Stand up the Supabase schema per `database-schema.md`: all tables, pgvector extension, `match_kb_chunks` function, RLS policies — Spec 02's scope.

## Completed

- H0–2: scope locked (`SCOPE.md`), KB topic list finalized, directory seed drafted.
- Project structure and context-file system defined (this file set).
- Spec 01: Project setup & deploy shell (see `context/specs/01-project-setup.md`) — Next.js/TypeScript/Tailwind v4/shadcn scaffold, color tokens wired into `app/globals.css`, empty page. Deployed live: **https://beca-self.vercel.app/**. H2–4 "done" criteria met.

## In Progress

- Spec 02: Supabase schema & migration (see `context/database-schema.md`, `context/specs/00-build-plan.md` unit 02)

## Next Up

- Spec 03: KB ingestion script
- Spec 04: Directory seed load

## Open Questions

- Which real Lagos neighbourhood/PHC to use for `clinic_directory.json` entries #5, #6, #7, #10 — currently placeholders.
- Whether the Lagos/Nigeria emergency number is verified — not yet confirmed, see `SCOPE.md`.
- `.gitignore`'s blanket `.env*` pattern also excludes `.env.example`, so it's never committed to the repo. Surfaced during Spec 01 but out of that spec's scope to fix. Needs a decision before Spec 02–03 land Supabase/Anthropic env vars: either add a `!.env.example` negation line, or accept documenting required env vars elsewhere (e.g. `architecture.md`).

## Architecture Decisions

- WHO fact sheets chosen as the sole approved source for the MVP (not NCDC or Lagos State Ministry of Health) — driven by ingestion feasibility at hackathon speed. See `architecture.md`.
- Nigerian Pidgin chosen as the single second-language mode — satisfies both the "multiple languages" and "simplified communication" brief bullets with one feature.
- No end-user auth, by design — matches the brief's privacy emphasis and the do-not-build list.
- AI provider confirmed: Anthropic Claude (Claude Sonnet 5). lib/ai/client.ts targets the Anthropic SDK; ANTHROPIC_API_KEY is the only provider key in .env.example/.env.local. $20 in Anthropic Console usage credits purchased, sized for dev/testing iteration plus the live judged demo (est. ~$0.02/conversation turn at Sonnet 5 pricing — see cost notes from Claude, Aug 2026).
- Tailwind CSS v4 confirmed (already scaffolded in the initial commit, along with Next.js 16.3.2 and shadcn/ui — ahead of Spec 01 being formally written). Tailwind v4 is CSS-first config with no `tailwind.config.ts`; theme values live in an `@theme` block in `app/globals.css`. `ui-context.md` and `code-standards.md` originally said "tailwind.config.ts" (a v3 assumption) — corrected both to point at `app/globals.css`'s `@theme` block instead. User confirmed this direction over creating a `tailwind.config.ts` + `@config` shim.
- `ui-context.md`'s teal interactive-color token renamed from `accent` to `brand` — shadcn/ui already reserves `--accent` internally as a neutral hover-background token used by every generated primitive; reusing the name would cause one value to silently clobber the other in the CSS `@theme` block. User confirmed renaming the brand token rather than overriding shadcn's `--accent`. Use `bg-brand` / `text-brand` / `border-brand` in components going forward, not `accent`.

## Session Notes

Read `SCOPE.md` and the "Grounded Navigator" strategy document for full product/judging context before starting Spec 01 — this tracker assumes that context is already known and does not repeat it.

- 2026-08-25: `CLAUDE.md` was missing a formal pointer to `SCOPE.md` and `context/specs/00-build-plan.md` — both were referenced repeatedly elsewhere but not listed as required reading. Added a "Before starting any spec" section to `CLAUDE.md` covering both files.
