# Beca

**A grounded health navigator for Lagos, Nigeria.** Beca is a single-screen chat assistant that answers general health and health-service questions in plain language and Nigerian Pidgin, grounded in WHO fact sheets with visible citations, and reliably escalates to a real clinic or emergency referral when a question goes beyond general information.

Built for **Track 4 — AI for Social Impact** (HealthAccess Initiative case study), 10AB AI BuildFest 2026.

**Live demo:** https://beca-self.vercel.app/

## Why

A caregiver in Lagos with a general health or service question needs a clear, trustworthy answer in plain language — and needs the system to reliably tell them when to stop reading and go see someone. Beca is built around two hard rules: never answer beyond its grounded source material, and never miss a genuine red flag.

## What it does

- Chat Q&A over a WHO-fact-sheet knowledge base (30 topics), retrieval-augmented with hybrid vector + keyword search
- A visible citation under every grounded answer — no uncited claims, ever
- A deterministic keyword check plus an AI urgency classifier running on every message, escalating to a matched clinic/service directory entry or emergency guidance when either fires
- Up to one round of clarifying questions when urgency can't be confidently classified from a single message
- A capability router beyond plain Q&A: preventive health guidance, structured appointment-preparation checklists, and deterministic service-navigation lookups ("where can I get antenatal care?") answered straight from a verified directory — no LLM invention
- Conversational intents (greetings, thanks, farewell, help requests, small talk, off-topic redirects) handled with fixed copy, never routed through retrieval
- Plain-language and Nigerian Pidgin toggles on the same answer
- Follow-up-aware conversation context — a bare "what are the causes" resolves against recent thread history before retrieval runs
- No login, no accounts, nothing persisted beyond the current session

See `context/project-overview.md` for the full feature list and locked scope, and `context/app-flow.md` for every UI state and user journey.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| AI provider | OpenAI — generation, classification, and embeddings (single provider) |
| Database | Supabase (Postgres + pgvector) |
| Hosting | Vercel |

Full architecture, folder structure, and system boundaries: `context/architecture.md`.

## Getting started

### Prerequisites

- Node 20+
- A Supabase project (Postgres + pgvector enabled)
- An OpenAI API key

### Setup

```bash
npm install
cp .env.example .env
# fill in OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
```

Run the migrations in `supabase/migrations/` in order against your Supabase project, then seed the knowledge base and directory:

```bash
npm run ingest-kb          # fetch WHO fact sheets, chunk, embed, store
npm run seed-directory     # load data/clinic_directory.json + red_flag_rules.json
npm run seed-preparation   # load data/preparation_checklists.json
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run ingest-kb` | Fetch + embed WHO fact sheets into Supabase (`--topics=N` to run one) |
| `npm run seed-directory` | Load the clinic directory + red-flag rules |
| `npm run seed-preparation` | Load appointment-preparation checklists |
| `npm run test-set` | Run the labeled query test set against a live deployment |
| `npm run capability-eval` | Run the per-capability evaluation datasets |

## Testing

`tests/run-test-set.ts` runs a labeled set of grounded / refused / escalated queries against a running instance (local or deployed) and reports pass rates. Current baseline: **100% overall (20/20), 100% on the escalation subset (7/7)**.

```bash
npm run test-set
# or against a specific target:
TEST_TARGET_URL=http://localhost:3000 npm run test-set
```

`evaluation/` holds labeled datasets per capability (health education, preventive guidance, preparation, service navigation, safety) for `npm run capability-eval`.

## Project structure

```
beca/
├── app/
│   ├── page.tsx                 # the single chat screen
│   └── api/
│       ├── chat/route.ts        # safety layer → capability router → RAG / preparation / navigation
│       └── services/route.ts    # directory lookup by category
├── components/
│   ├── chat/                    # ChatThread, MessageBubble, EscalationCard, ClarificationCard,
│   │                             # ServiceResultsCard, ConversationalReplyBubble, toggles, etc.
│   └── ui/                      # shadcn primitives
├── lib/
│   ├── ai/                      # prompts, schema, classification, generation
│   ├── kb/                      # runtime retrieval
│   ├── directory/                # clinic/service lookups
│   └── preparation/              # checklist lookups
├── scripts/                      # one-off ingestion/seeding scripts
├── supabase/migrations/
├── data/                         # kb_topics.json, clinic_directory.json, preparation_checklists.json
├── evaluation/                   # labeled eval datasets
├── tests/                        # test-set runner
└── context/                      # the full spec/architecture/decision record — see below
```

## Project documentation

This repo is driven by a written context system, not tribal knowledge. Anyone (human or AI agent) implementing against this codebase should read, in order:

1. `context/project-overview.md` — what this is, who it's for, scope
2. `context/architecture.md` — stack, folders, env vars, invariants
3. `context/app-flow.md` — the chat screen's states and user journeys
4. `context/ui-context.md` — colors, typography, spacing, component specs
5. `context/database-schema.md` — every table, RLS, functions
6. `context/code-standards.md` — naming, TypeScript rules, invariants
7. `context/ai-workflow-rules.md` — how work is scoped and split
8. `context/progress-tracker.md` — what's done, what's next, open questions

`SCOPE.md` holds the locked persona/region/language/feature-freeze decisions. `context/specs/00-build-plan.md` lists every buildable unit; `context/specs/NN-*.md` are the individual spec files that record what was actually built and verified for each.

## Hard invariants

- Never answer a health question outside retrieved context — below the similarity cutoff, say so instead of guessing.
- Never output a diagnosis, a drug name plus dosage, or a treatment plan, in any code path.
- No raw user message text is persisted beyond the current session; no user-identity table exists anywhere in the schema.
- Every citation shown in the UI is validated against an actual retrieved chunk before rendering.
- The capability router never runs before, or in place of, the safety layer (deterministic red-flag check + AI urgency classifier) — `service_navigation` responses are built entirely from verified directory data, never invented by the model.

Full list: `context/architecture.md`.

## Status

All planned build-plan units are complete, including hybrid retrieval, the capability router, multi-turn triage clarification, conversation-context resolution, and conversational-intent handling. See `context/progress-tracker.md` for the current state, verification gaps explicitly flagged as not-yet-checked, and open questions.

## Out of scope

Diagnosis, prescriptions, or treatment recommendations; user accounts or authentication; any language beyond English and Nigerian Pidgin; any clinic/service data source beyond the seed directory; voice or native mobile apps; EHR or booking-system integration; fine-tuning; autonomous multi-step agent behaviour. Full list: `context/project-overview.md`.
