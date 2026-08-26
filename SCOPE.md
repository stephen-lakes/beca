# Beca — Locked Scope (H0–2)

**Concept:** Grounded Health Navigator (Track 4 — AI Healthcare Information Assistant, HealthAccess Initiative)

**One-sentence problem/user statement (say this out loud to the team, then stop discussing scope):**
> A caregiver in Lagos with a general health or service question needs a clear, trustworthy answer in plain language — and needs the system to reliably tell them when to stop reading and go see someone.

**Locked persona:**
Amara, 29, mother of two in a densely populated Lagos community. Her main point of contact for care is a local Primary Health Centre (PHC). Moderate digital literacy, comfortable with WhatsApp-style chat, more comfortable in plain English or Nigerian Pidgin than formal medical English. (Optional second demo beat: same persona, pregnancy-related question, per Section 05's maternal angle.)

**Region & approved source — locked:**
Lagos, Nigeria. Approved source = **WHO fact sheets** (global, stable URLs, no API key, directly verifiable). Lagos/Nigeria-specific structured health-content APIs (state ministry, NCDC) aren't readily ingestible at hackathon speed, so this is a **stated, defensible scope decision** — say it plainly in the pitch, don't hide it: *"Our knowledge base is WHO fact sheets for this prototype; a production version would add NCDC and Lagos State Ministry of Health content."*

**Language / accessibility — locked:**
Plain-language English toggle (default-on) **+ Nigerian Pidgin** as the second-language toggle. Pidgin is a real, widely spoken second mode in Lagos and functions as both "another language" and "simplified communication" — one feature satisfies two brief bullets. Yoruba is a stretch goal only, not core.

**Team:** Solo. Hold the two-thirds feature-freeze rule strictly. If anything must be cut under time pressure, cut the Pidgin toggle or shrink the directory before ever touching grounding/citations or the escalation logic (see the confirmed tie-break order: Impact & Usefulness → Execution & Functionality → Innovation & Originality).

## H0–2 checklist

- [x] Concept locked — Grounded Health Navigator
- [x] Persona locked — Amara
- [x] Region/source locked — Lagos, Nigeria / WHO fact sheets
- [x] Language locked — Plain English + Nigerian Pidgin
- [x] KB topic list finalized — `kb_topics.json` (12 topics, real WHO URLs)
- [x] Directory seed drafted — `clinic_directory.json` (12 entries — several need a 10-minute verification pass)
- [ ] **→ Next: H2–4** — wireframe the single chat screen + escalation state, lock the JSON output schema, scaffold the repo, deploy an empty shell to a live URL

## Known unverified items — confirm before the live demo

- Lagos ambulance/emergency number — check [lagosstate.gov.ng/emergency-numbers](https://lagosstate.gov.ng/emergency-numbers/) or [LASEMA](https://lasema.lagosstate.gov.ng/contact-us-2/) directly; do not trust a remembered number.
- Nigeria's unified emergency number, commonly cited as 112 — confirm it's current before putting it on screen.
- Current phone numbers/addresses for every named facility in `clinic_directory.json` — names are real, contact details are not verified yet.
- Pick one real neighbourhood (e.g. Mushin, Ajegunle, Yaba) for Amara and find one real nearby PHC to fill entries #5–7 and #10.
