# Progress Tracker

Update this file after every spec implementation.

## Current Phase

Phase 0 — Project structure and context system (this setup).

## Current Goal

Get the repo scaffolded, context files finalized, and an empty shell deployed to a live URL — the H2–4 "done" criteria from the 24-hour execution plan.

## Completed

- H0–2: scope locked (`SCOPE.md`), KB topic list finalized, directory seed drafted.
- Project structure and context-file system defined (this file set).

## In Progress

- Spec 01: Project setup & deploy shell (see `context/specs/01-project-setup.md`) — code complete and locally verified (clean `tsc`, `lint`, `build`, `dev`); blocked only on the live Vercel deploy step, which needs GitHub/Vercel account auth the build sandbox doesn't have. User is pushing to GitHub and connecting Vercel themselves.

## Next Up

- Spec 02: Supabase schema + migration
- Spec 03: KB ingestion script

## Open Questions

- Which real Lagos neighbourhood/PHC to use for `clinic_directory.json` entries #5, #6, #7, #10 — currently placeholders.
- Whether the Lagos/Nigeria emergency number is verified — not yet confirmed, see `SCOPE.md`.

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
