# Project Overview

Grounded Navigator is a chat-based AI assistant that answers general health and health-service questions for people in Lagos, Nigeria, in plain language and Nigerian Pidgin, grounded in WHO fact sheets with visible citations — and that reliably escalates to a real clinic, service, or emergency referral when a question goes beyond general information. Built for Track 4 (AI for Social Impact), HealthAccess Initiative case study, 10AB AI BuildFest 2026.

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
- RAG Q&A over the WHO-fact-sheet knowledge base (12 topics — see `data/kb_topics.json`)
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
