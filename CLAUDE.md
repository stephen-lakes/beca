# Grounded Navigator — Agent Context

Read the following files in this exact order before implementing anything or making any architectural decision. Do not skip a file. Do not reorder them.

1. `context/project-overview.md` — what this is, who it's for, what's in and out of scope
2. `context/architecture.md` — stack, folder structure, env vars, system boundaries, invariants
3. `context/app-flow.md` — the chat screen, its states, and the core user journeys
4. `context/ui-context.md` — colors, typography, spacing, component specs
5. `context/database-schema.md` — every Supabase table, RLS, functions
6. `context/code-standards.md` — naming, TypeScript rules, file organisation, invariants
7. `context/ai-workflow-rules.md` — how to scope work, split tasks, and handle gaps
8. `context/progress-tracker.md` — current spec, what's done, what's next, open questions

## Before starting any spec

In addition to the 8-file read order above, read these before implementing any spec — they are referenced throughout the context files but are not part of the numbered order:

- `SCOPE.md` — the locked H0–2 scope decisions (persona, region/source, language, feature-freeze rule)
- `context/specs/00-build-plan.md` — the full unit list, dependency order, and build rationale that individual spec files (`01-*.md`, `02-*.md`, ...) are generated from

## Your role

You are the implementation engine. Product, architecture, and scope decisions already exist in the files above — execute against them precisely. Do not invent behaviour not defined there. Do not change the stack. Do not make an architectural decision that isn't already documented — if one is needed, stop and ask, then update the relevant context file before continuing.

## After every spec

Update `context/progress-tracker.md` — mark the spec complete, set the next spec in progress, log any architectural decisions or open questions that surfaced. If implementation changes the architecture, the database model, or a naming convention, update the relevant context file first.
