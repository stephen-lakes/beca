# Architecture

## Stack

| Layer | Technology | Version | Role |
|---|---|---|---|
| Frontend | Next.js (App Router) | 14+ | UI, routing, API routes |
| Language | TypeScript | 5+ | Strict mode everywhere |
| Styling | Tailwind CSS + shadcn/ui | latest | All visual output — see `ui-context.md` |
| AI provider | OpenAI API | gpt-5.6-terra | Generation, classification, structured output |
| Embeddings | OpenAI `text-embedding-3-small` | 1536 dims (native) | KB retrieval — 1536 matches `kb_chunks.embedding vector(1536)` with no config; see `progress-tracker.md` Architecture Decisions |
| Database | Supabase (Postgres + pgvector) | — | KB chunks, directory, red-flag rules |
| Hosting | Vercel | — | Frontend + API routes, git-push deploys |
| KB source | WHO fact sheets, 28 topics | — | Fetched once, ingested at build time — see `data/kb_topics.json`. Expanded 12 → 21 post-launch (architecture audit, 2026-08-27), then 21 → 28 (capability router pass, 2026-08-28) to close real KB-coverage gaps; see `progress-tracker.md`. |

**Single provider, resolving the original "open decision" this section used to carry.** Generation, classification, and embeddings all run on OpenAI now — not the Anthropic-for-generation / OpenAI-for-embeddings split Spec 03–05 originally set up. Switched because no Anthropic API key is available, and this consolidates to the one provider already proven working (embeddings, since Spec 03) rather than maintaining two provider integrations for one hackathon-scale app. Full reasoning, model choice, and cost/latency comparison: `progress-tracker.md` Architecture Decisions. `lib/ai/client.ts` is still the only place the generation/classification provider is referenced (the swap stayed contained to that one file, as this section anticipated when it was still an open decision); the embedding call lives in `scripts/ingest-kb.ts` (ingestion) and `lib/kb/search.ts` (query-time embedding) — never in `lib/ai/`, which is reserved for generation/classification per `code-standards.md`.

## Folder structure

```
beca/
├── CLAUDE.md / AGENTS.md / README.md
├── context/                    # this file and its siblings — the agent context system
│   └── specs/                  # 00-build-plan.md + one file per buildable unit
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # the single chat screen
│   ├── globals.css
│   └── api/
│       ├── chat/route.ts        # POST — safety layer + capability router + RAG/preparation/navigation
│       └── services/route.ts    # GET — directory lookup by category
├── components/
│   ├── chat/                    # ChatThread, MessageBubble, CitationChip,
│   │                             # EscalationCard, LanguageToggle, ReadingLevelToggle,
│   │                             # EmptyState, ErrorState, DisclaimerBar (Spec 10),
│   │                             # Header (Spec 12), ClarificationCard (Spec 18),
│   │                             # ServiceResultsCard (Spec 20)
│   └── ui/                      # shadcn primitives — do not hand-edit generated files
├── lib/
│   ├── ai/                      # client.ts, prompts.ts, schema.ts, classify.ts, classify-capability.ts (Spec 20)
│   ├── kb/                      # search.ts — runtime retrieval only
│   ├── directory/                # lookup.ts (category- and service-based)
│   ├── preparation/              # lookup.ts (Spec 20) — preparation_checklists only
│   └── supabase/                 # server-only client.ts
├── scripts/
│   ├── ingest-kb.ts               # one-off: fetch WHO fact sheets → chunk → embed → store
│   ├── seed-directory.ts          # one-off: load data/clinic_directory.json → directory_entries
│   └── seed-preparation.ts        # one-off: load data/preparation_checklists.json → preparation_checklists (Spec 20)
├── supabase/
│   └── migrations/0001_init.sql, 0002_hybrid_search.sql, 0003_capabilities.sql
├── data/
│   ├── kb_topics.json
│   ├── clinic_directory.json
│   └── preparation_checklists.json
├── evaluation/                    # Spec 20 — 5 labeled eval datasets, one per capability + safety
├── public/
└── tests/
```

## System boundaries

- `app/api/*` is the only place server secrets (Supabase service role key, AI API key) are read. Nothing under `components/` or any client-side code imports them.
- `lib/ai/` owns all prompt construction, schema validation, and provider calls. Nothing else constructs a prompt.
- `lib/kb/` and `lib/directory/` are the only modules that query Supabase.
- `scripts/ingest-kb.ts` is the only thing that fetches from who.int. It never runs at request time — the KB is pre-ingested, not live-fetched on each chat turn.

## Third-party services

| Service | Purpose | Tier |
|---|---|---|
| OpenAI API | Generation, classification, embeddings | Pay-as-you-go — negligible at hackathon scale |
| Supabase | Postgres + pgvector + (unused) storage | Free tier |
| Vercel | Frontend + serverless functions | Free tier |

## Environment variables

See `.env.example` at the project root — every variable is listed with what it accesses. No variable is duplicated or renamed elsewhere.

## Storage model

- Structured KB chunks, embeddings, directory entries, and red-flag rules live in Supabase Postgres/pgvector.
- No file storage is used — no uploads in this MVP.
- No cache layer is needed at this scale.
- No user-identity table exists anywhere in the schema. This is deliberate — see `database-schema.md`.
- **Retrieval is hybrid as of Spec 19**: `lib/kb/search.ts` calls `match_kb_chunks_hybrid`, which unions the existing pgvector similarity search with a Postgres full-text-search (`tsvector`/GIN) rescue channel for chunks the vector search alone would miss below the similarity cutoff, plus bounded, non-LLM keyword-based query expansion sourced from `kb_sources.keywords`. Still Postgres/pgvector only — no new database. See `database-schema.md` and `context/specs/19-hybrid-retrieval-fallback-diagnostics.md`.
- **Capability router as of Spec 20**: `preparation_checklists` (structured, deterministic — never vector search) and `directory_entries.services` (service-based, additive to the existing escalation `category` column) support `healthcare_preparation` and `service_navigation` respectively. `health_education`/`preventive_health`/`disease_information`/`when_to_seek_care`/`medication_safety`/`out_of_scope` all still route through the unmodified hybrid RAG pipeline above — see `context/specs/20-capability-router-and-navigation.md`.
- **Conversation context resolution as of Spec 23**: `app/api/chat/route.ts` first resolves a non-self-contained follow-up (e.g. "what are the causes") against a client-supplied, bounded `recentHistory` window into a standalone query, via the new `lib/ai/resolve-context.ts` classifier — before the urgency classifier, the capability classifier, and retrieval all run. The deterministic red-flag keyword check is the one exception, still evaluating the raw, verbatim message always. No new table — `recentHistory` is read-only per-request, never persisted, same stateless-server contract `priorClarification` (Spec 17) already established. See `context/specs/23-conversation-context-resolution.md`.

## Auth model

None for end users. An optional judge/admin debug view, if built, is gated by a single shared value read from `ADMIN_DEBUG_PASSWORD` — not a real authentication system.

## Hard invariants

1. The AI never answers a health question outside the retrieved context — below the similarity cutoff, it says so instead of guessing.
2. The AI never outputs a diagnosis, a drug name plus dosage, or a treatment plan, in any code path.
3. The Supabase service role key is never referenced outside `app/api/*` and `lib/*` server modules.
4. No raw user message text is persisted beyond the current session.
5. Every citation shown in the UI is validated against an actual retrieved chunk ID before rendering — the model's claim is never trusted unchecked.
6. No color, spacing, or font value is hardcoded in a component — everything comes from the Tailwind theme tokens defined in `ui-context.md`.
7. The capability router (`lib/ai/classify-capability.ts`, Spec 20) never runs before, or in place of, the safety layer (deterministic red-flag check + AI urgency classifier, Specs 06/17) — it only ever sees a message the safety layer has already cleared. `service_navigation` responses are built entirely from `directory_entries` query results, with no LLM call at all — the model never invents a facility.
