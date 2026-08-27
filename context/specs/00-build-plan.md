# Build Plan — Beca

Generated before implementation begins. Units are in dependency order. Each unit stays within one system boundary and produces one visible, verifiable result. Individual spec files (`01-*.md`, `02-*.md`, ...) are generated just-in-time, right before each unit is implemented — not written in advance.

## Units

| # | Name | What it builds | Depends on |
|---|---|---|---|
| 01 | Project setup & deploy shell | `create-next-app` scaffold, Tailwind + shadcn init, empty page deployed live on Vercel | Nothing |
| 02 | Supabase schema & migration | All tables in `database-schema.md`, pgvector extension, `match_kb_chunks` function, RLS | 01 |
| 03 | KB ingestion script | `scripts/ingest-kb.ts` — fetch the 12 WHO fact sheets, chunk, embed, store in `kb_sources`/`kb_chunks` | 02 |
| 04 | Directory seed load | Load `data/clinic_directory.json` and the red-flag keyword list into Supabase | 02 |
| 05 | RAG retrieval + chat API (no classifier yet) | `lib/kb/search.ts` + `app/api/chat/route.ts` returning grounded, cited JSON — verified via curl, no UI | 03 |
| 06 | Urgency classifier + escalation branch | Deterministic + AI classification added to the API route; structured-output schema extended with escalation fields | 04, 05 |
| 07 | Chat UI shell (mock data) | `ChatThread`, `MessageBubble`, `CitationChip`, `EscalationCard` components wired to a mocked response matching the schema | 01 — can run in parallel with 03–06 |
| 08 | Wire chat UI to the real API | Replace mock data with real `/api/chat` calls | 06, 07 |
| 09 | Plain-language + Pidgin toggles | Toggle UI + the corresponding fields in the AI response schema | 08 |
| 10 | Disclaimer, privacy notice, error/empty states | Persistent UI elements from `app-flow.md` | 07 |
| 11 | Test-set script | Run the 15–25 query test set against the deployed build, log pass/fail by category | 08 |
| 12 | Demo polish pass | Escalation-card visual treatment, citation styling, final pass against `ui-context.md` | 09, 10 |
| 17 | Multi-turn triage clarification — classifier | Extend `lib/ai/classify.ts` and the shared response schema with a `needs_clarification` type (up to 2 questions, one round only); `app/api/chat/route.ts` tracks whether the prior turn asked a clarifying question and folds the user's reply into re-classification. Verified via curl, no UI. | 06 |
| 18 | Multi-turn triage clarification — UI | Render the clarification state distinctly in `ChatThread`/`MessageBubble` per the updated `app-flow.md`; wire the follow-up reply into the existing chat input, no new input mechanism. | 17 |
| 19 | Hybrid retrieval, query expansion, fallback diagnostics | Postgres full-text search alongside the existing pgvector search (new migration), keyword-metadata-driven query expansion, and A–E fallback-outcome logging in `app/api/chat/route.ts` — no UI, no response-shape change. Drafted 2026-08-27 from the architecture audit's Phase 1; **not yet approved to implement**, see `context/specs/19-hybrid-retrieval-fallback-diagnostics.md`. | 05 |

## Build order rationale

Backend before frontend (05–06 before 08): the API contract has to exist before the UI can be wired to real data, though the UI shell (07) is deliberately built in parallel against mock data so no time is lost waiting. Schema before everything (02 before 03–06): nothing can be ingested or queried without tables to hold it. Security/safety before polish: the classifier and escalation branch (06) land before any visual polish (12) — matches the confirmed judging tie-break order (Impact & Usefulness → Execution & Functionality → Innovation & Originality). Dependencies are installed just-in-time, inside the spec where they're first needed, not upfront in unit 01.

## Total units: 14 (15 listed — unit 19 is drafted/proposed, not yet approved to implement; see its row above)

## Estimated sessions: 8–10 (solo build, matches the H4–19 core-build-through-polish window in the 24-hour plan)
