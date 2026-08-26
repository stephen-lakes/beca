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

## Core user journeys

**Journey 1 — Normal question**
1. User types a question → `POST /api/chat`.
2. `lib/kb/search.ts` embeds the query and retrieves the top-k chunks.
3. `lib/ai/client.ts` generates a structured JSON response (see `code-standards.md` for the schema).
4. UI renders the answer bubble with its citation chip.

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

## Redirect logic

There is no page navigation, so there is no redirect table. The only "redirect" in this app is that an urgency flag redirects the *rendering path* of the current message, not any URL.
