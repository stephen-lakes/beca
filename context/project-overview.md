# Project Overview

Beca is a chat-based AI assistant that answers general health and health-service questions for people in Lagos, Nigeria, in plain language and Nigerian Pidgin, grounded in WHO fact sheets with visible citations — and that reliably escalates to a real clinic, service, or emergency referral when a question goes beyond general information. Built for Track 4 (AI for Social Impact), HealthAccess Initiative case study, 10AB AI BuildFest 2026.

## Goals (measurable)

1. 100% of general-health answers cite a real source from the knowledge base, or explicitly state that grounded information isn't available — never an uncited claim.
2. 100% of red-flag test queries (the 15–25 query test set) trigger the escalation state, not a plain answer.
3. Core loop (question → answer) responds in under ~5 seconds in the demo environment.
4. Zero PII persisted beyond the current session.

## Core user flow

1. User opens the app — no login, no setup.
2. User types a health or service question.
3. App returns a plain-language, cited answer, or an escalation card if the question is urgent.
4. User can toggle plain-language and Nigerian Pidgin on the same answer.
5. User can add a follow-up message in the same thread — the same thread can flip from a normal answer to an escalation as new information arrives.

## Feature list

**Must-Have (MVP)**

- Single-page chat interface, no login
- RAG Q&A over the WHO-fact-sheet knowledge base (30 topics as of the 2026-09-03 seasonal-influenza addition — 29 as of the 2026-08-29 immunization-schedule addition, 28 as of the 2026-08-28 capability-router pass, 21 as of the 2026-08-27 architecture-audit expansion, originally 12 at MVP lock — see `data/kb_topics.json`)
- Visible citation under every grounded answer
- Deterministic + AI urgency classifier running on every message
- Escalation card with a matched entry from the seed clinic directory (`data/clinic_directory.json`)
- Plain-language toggle
- Nigerian Pidgin toggle
- Persistent disclaimer and privacy notice

**Nice-to-Have (explicitly Post-MVP)**

- Yoruba language support
- Voice input/output
- Real-time clinic booking or live directory data
- User accounts, saved history, personalisation
- Admin/analytics dashboard beyond a small demo metrics panel

## Approved Post-MVP Enhancements

Kept separate from the Must-Have list above so the build history stays honest about what was in the original MVP scope vs. approved afterward.

- **Multi-turn triage clarification.** The urgency classifier asks up to two targeted clarifying questions, in-thread, when it can't confidently classify urgency from a single message alone. Capped at one round: if the clarifying reply still leaves genuine uncertainty, the system escalates rather than asking further questions. This deepens the existing Spec 06 classifier/escalation logic rather than introducing a new capability area, and does not conflict with the "no autonomous multi-step agent behaviour" out-of-scope line below — it's exactly one bounded, user-initiated exchange in the same pattern Journey 2 already uses (a follow-up message in the same thread re-running classification), not open-ended autonomous action.
- **Capability router (Spec 20, 2026-08-28).** Beyond the original Health Education RAG capability, Beca now separately classifies and handles **Preventive Health Guidance** (routing-level distinct from Health Education, sharing the same RAG pipeline and evidence), **Healthcare Preparation** (a structured, deterministic checklist lookup — never vector search — for appointment/service preparation), and **Healthcare Service Navigation** (a fully deterministic `directory_entries` lookup by service, no LLM call, never inventing a facility). The capability classifier runs strictly after the existing safety layer (deterministic red-flag check + AI urgency classifier) has already cleared a message — it is a routing layer, never a second safety mechanism. See `context/specs/20-capability-router-and-navigation.md` for full detail.

## User stories

- As a Lagos resident with a general health question, I want a clear, cited answer in plain language, so that I don't have to parse dense or unreliable web content.
- As a person describing worsening symptoms, I want the assistant to tell me clearly when to see someone and where, so that I don't miss something serious.
- As someone more comfortable in Pidgin than formal English, I want the same answer in Nigerian Pidgin, so that the information is actually usable to me.

## Out of scope (explicit)

- Diagnosis, prescriptions, or treatment recommendations of any kind — a hard safety constraint from the case study, not a preference.
- User accounts or authentication.
- Any language beyond English and Nigerian Pidgin.
- Any clinic/service data source other than the seed directory in `data/clinic_directory.json`.
- Voice, native mobile apps, EHR or booking-system integration.
- Fine-tuning a model, or any autonomous multi-step agent behaviour.

## Success metrics

- Test-set pass rate (correct grounded / refused / escalated behaviour) ≥ 90% on the 15–25 query set.
- The live demo completes the full happy-path + escalation-flip conversation without a crash.
- Every answer shown in the demo carries a visible, valid citation or an explicit "no grounded information" message — never a silent guess.
