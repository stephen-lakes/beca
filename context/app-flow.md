# App Flow

Single screen, no routing between pages. "Flow" here means UI states within that one screen, not navigation between routes.

## Master screen list

| Screen | Path | Description |
|---|---|---|
| Chat | `/` (`app/page.tsx`) | The entire application — header, message thread, input, toggles, disclaimer bar |

## States within the chat screen

1. **Empty state** — no messages yet; a short prompt suggestion (e.g. "Ask about vaccines, a clinic, or how to prepare for an appointment").
2. **Normal answer state** — a grounded, cited, plain-language answer bubble.
3. **Escalation state** — a visually distinct card: urgency reason, matched directory entry, emergency guidance where relevant. Never rendered as a plain chat bubble — see `ui-context.md`.
4. **No-grounded-information state** — the model explicitly says it lacks approved-source information on the topic. Never a fabricated answer.
5. **Error state** — API or network failure: a plain "something went wrong, try again" message. Never a raw error or stack trace shown to the user.
6. **Clarification state** — the classifier can't yet determine urgency from the message alone, so it asks up to two targeted follow-up questions in the same thread before deciding. Rendered distinctly from both a normal answer bubble and the escalation card. Capped at one clarification round: if the follow-up still leaves genuine uncertainty, the system escalates rather than asking again.
7. **Service results state** (Spec 20) — a calm, non-alarming card listing verified facilities matched from `directory_entries` for a `service_navigation` question (e.g. "Where can I get antenatal care?"). Never the escalation card's styling — this carries no safety alarm. A genuine zero-match result renders the same card with an honest "not on file" message, never a fabricated facility.

## Core user journeys

**Journey 1 — Normal question**
1. User types a question → `POST /api/chat`.
2. If the message isn't self-contained on its own — a follow-up like "what are the causes" or "is it common here" (pronouns, "the causes," "what about," no clear subject) — it's resolved against recent conversation history into a self-contained query *before* retrieval or classification run (Spec 23). This resolved query, not the raw message, is what step 2 embeds and what the classifier evaluates; it's not treated as a standalone query in isolation. This is independent of Journey 4's clarification-answer tracking, which handles a narrower case (whether the user's message answers a clarifying question the app itself just asked) — the two mechanisms coexist without interfering.
3. `lib/kb/search.ts` embeds the (resolved) query and retrieves the top-k chunks.
4. `lib/ai/client.ts` generates a structured JSON response (see `code-standards.md` for the schema).
5. UI renders the answer bubble with its citation chip.

**Journey 2 — Escalation flip (the demo's wow moment)**
1. Same thread as Journey 1; the user adds a follow-up containing a red-flag detail.
2. The deterministic keyword check and the AI classifier both run on the new message.
3. If either flags urgency, `GET /api/services` fetches a matching directory entry by category.
4. UI renders the escalation card in place of a plain answer bubble.

**Journey 3 — Language / reading-level toggle**
1. User toggles "Simple language" or "Pidgin" on an existing answer.
2. No new API call is needed if `simple_version` / `pidgin_version` were already returned in the original response; otherwise, one lightweight re-render call.

**Journey 4 — Triage clarification**
1. User sends a message the classifier can't confidently classify as urgent or not from the text alone.
2. Instead of a normal answer or an escalation, the app renders the Clarification state: up to two targeted follow-up questions, asked in the same thread.
3. User replies in the same thread, using the same input — no new input mechanism.
4. The classifier re-runs, using the original message plus the clarifying exchange as combined context.
5. Definitive result: a normal answer or an escalation card — never a second round of clarifying questions, even if uncertainty remains.

**Journey 5 — Capability-routed question (Spec 20)**
1. Same as Journey 1, except after the safety layer clears the message (not urgent, not needing clarification), a capability classifier (`lib/ai/classify-capability.ts`) labels it: `health_education` / `preventive_health` / `disease_information` / `when_to_seek_care` / `medication_safety` / `out_of_scope` all continue through Journey 1's unmodified RAG flow.
2. A `healthcare_preparation` question (e.g. "What should I bring to my antenatal appointment?") is answered from a structured, exact-match checklist (`preparation_checklists`), not vector search — the checklist is the only "evidence" the model is given, so it can only rephrase it conversationally, never invent beyond it. Renders as a normal answer bubble with a citation to the checklist.
3. A `service_navigation` question (e.g. "Where can I get vaccinated?") is answered entirely from `directory_entries` with no LLM call at all — see the Service results state above. A genuine zero-match is stated honestly.

## Redirect logic

There is no page navigation, so there is no redirect table. The only "redirect" in this app is that an urgency flag redirects the *rendering path* of the current message, not any URL.
