# AI Workflow Rules

## Approach

Build incrementally, spec by spec, per `context/specs/00-build-plan.md`. Implement exactly what the active spec describes. Do not infer or invent behaviour beyond it.

## Scoping rules

- Work on one spec file at a time.
- Never combine a UI change and an API-route change in the same implementation step.
- Never touch more than one system boundary (`lib/ai`, `lib/kb`, `lib/directory`, `components/`) per step unless the spec explicitly says so.

## When to split work

Split into separate specs whenever a unit would combine:
- UI changes and API-route changes
- The RAG pipeline and the urgency classifier (one flow, two independently verifiable pieces)
- Any behaviour not explicitly listed in `project-overview.md`'s Must-Have list

## Handling missing requirements

If something is undefined or ambiguous, add it to Open Questions in `progress-tracker.md` and stop. Do not guess — especially on anything touching the safety or escalation logic.

## Protected files

Do not modify without explicit instruction:
- Everything in `context/*.md` except `progress-tracker.md`
- `data/kb_topics.json` and `data/clinic_directory.json` — edit the ingestion script's source list, not the generated rows, by hand
- `supabase/migrations/*` once applied — write a new migration instead of editing an old one

## Keeping docs in sync

| When this happens | Update this file |
|---|---|
| Stack or provider changes | `architecture.md` |
| New table or column | `database-schema.md` |
| New screen or state | `app-flow.md` |
| New naming convention | `code-standards.md` |
| New design token | `ui-context.md` |
| Any architectural decision | `progress-tracker.md` (Architecture Decisions) |
| Spec completed | `progress-tracker.md` (Completed) |

## Before moving to the next spec

1. The spec's verify checklist is fully complete.
2. No invariant in `architecture.md` or `code-standards.md` was violated.
3. No TypeScript errors.
4. No console errors.
5. `npm run dev` still starts cleanly.
6. `progress-tracker.md` reflects the completed work.
