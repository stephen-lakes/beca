# Code Standards

## General principles

1. Single-purpose modules — a file does one job.
2. No workaround fixes — if a fix needs a hack, stop and find the root cause (see `ai-workflow-rules.md`).
3. Server secrets never reach client code. No exceptions.

## TypeScript rules

- `strict: true` in `tsconfig.json`. No `any` — use `unknown` and narrow, or a zod schema.
- Validate all external input (API request bodies, AI JSON output) with zod at the system boundary.

## Framework conventions

- Next.js App Router file conventions — one `app/api/<resource>/route.ts` per resource.
- Server Components by default. `'use client'` only on components that need interactivity (chat input, toggles).

## Styling rules

No hardcoded hex or arbitrary pixel spacing values in components — use the Tailwind theme tokens defined in `ui-context.md` only. This project runs Tailwind CSS v4 (CSS-first config) — theme colors live in the `@theme` block in `app/globals.css`, not in a `tailwind.config.ts` (none exists).

## AI / backend rules

- All prompt construction lives in `lib/ai/prompts.ts` — nothing else builds a prompt string.
- Every generation call requests structured JSON validated against the shared zod schema in `lib/ai/schema.ts`. A malformed response is retried once, then falls back to a safe canned response — never shown to the user unvalidated.
- Retrieval below the similarity cutoff must produce a "no grounded information" response — never a fallback to the model's parametric knowledge.

## Naming conventions

| Item | Convention | Example |
|---|---|---|
| Component files | PascalCase | `EscalationCard.tsx` |
| Utility files | kebab-case | `kb-search.ts` |
| React components | PascalCase | `ChatThread` |
| Hooks | camelCase, `use` prefix | `useChatSession` |
| API route folders | kebab-case, resource-named | `app/api/chat/route.ts` |
| Zod schemas | PascalCase + `Schema` suffix | `ChatResponseSchema` |
| Env vars | SCREAMING_SNAKE_CASE | `ANTHROPIC_API_KEY` |

This table is the single source of truth for naming — it is not repeated in `architecture.md`.

## File organisation

- `lib/ai/` — nothing but AI provider calls, prompts, schemas, classification.
- `lib/kb/` — nothing but knowledge-base retrieval.
- `lib/directory/` — nothing but directory lookups.
- Components never call Supabase or the AI provider directly — always through an API route.

## Hard invariants

1. No `any` in committed code.
2. No raw hex or spacing values outside `app/globals.css`'s `@theme` block and `ui-context.md`.
3. No Supabase or AI-provider import outside `lib/` and `app/api/`.
4. No uncited health claim rendered in the UI.
5. No new npm dependency added without a one-line reason recorded in the relevant spec file.
