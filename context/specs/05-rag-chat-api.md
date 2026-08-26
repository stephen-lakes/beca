# Spec 05 — RAG retrieval + chat API (no classifier yet)

## Goal

Build `lib/kb/search.ts` + `app/api/chat/route.ts`: a working `POST /api/chat` that embeds the user's question, retrieves grounded WHO-fact-sheet context, generates a cited plain-language answer, and returns structured, citation-validated JSON — verified via curl, no UI, no urgency classifier yet.

## Depends on

Spec 03 (KB ingestion — done; `kb_sources`/`kb_chunks` populated and live, `match_kb_chunks` verified).

## Decisions (resolved before implementation)

This is the first spec to build `lib/ai/` and the running app's Supabase client, so several concrete design choices are made here rather than left to guesswork at implementation time:

1. **Model: `claude-sonnet-5`.** Already locked in `progress-tracker.md`'s Architecture Decisions ("AI provider confirmed: Anthropic Claude (Claude Sonnet 5)") and `architecture.md`'s stack table — not a fresh choice, just applied here for the first time.
2. **Structured output via `client.messages.parse()` + `output_config.format: zodOutputFormat(...)`** (confirmed present in the installed `@anthropic-ai/sdk@0.120.0`), not the deprecated `output_format` parameter and not manual JSON-mode prompting. This is what code-standards.md's "structured JSON validated against the shared zod schema in `lib/ai/schema.ts`" resolves to concretely.
3. **Retrieval-cutoff enforcement is a deterministic short-circuit, not a model judgment call.** If `match_kb_chunks` returns zero rows at or above `min_similarity`, the route returns the "no grounded information" response **without calling the LLM at all**. This is the most direct enforcement of `architecture.md`'s hard invariant 1 ("below the similarity cutoff, it says so instead of guessing") — it doesn't rely on trusting the model to self-report correctly when nothing relevant was even retrieved. The model can *still* self-report `grounded: false` on its own, for the separate case where something passed the cutoff but doesn't actually answer the specific question (see schema below) — that's a real, distinct case a numeric cutoff alone can't catch.
4. **`min_similarity: 0.2`, `match_count: 5`** for the initial `match_kb_chunks` call. `similarity` in this schema is `1 - cosine_distance` (confirmed by reading `supabase/migrations/0001_init.sql` directly, not assumed) — higher is better. A real on-topic query tested during Spec 03's verification (malaria symptoms) scored 0.4867–0.5475 against genuinely relevant chunks; 0.2 is a permissive floor meant to exclude clearly-unrelated content without excluding legitimate but loosely-worded matches. **Flagged as tunable** — not a safety-critical judgment call like Spec 04's, but the two numbers directly gate what counts as "grounded," so they should be revisited against the Spec 11 test-set rather than treated as final.
5. **Citation validation lives inside `lib/ai/client.ts`'s `generateAnswer`, not the route.** The function already receives the retrieved chunks (it needs their content to build the prompt), so it already has the valid `chunk_id` set on hand. After a `parse()` call, it checks: every `citations[].chunk_id` exists in the retrieved set, `grounded: true` implies `citations` is non-empty, `grounded: false` implies `citations` is empty. Any violation — plus two failure modes confirmed by reading the installed `@anthropic-ai/sdk`'s source directly rather than assumed: `messages.parse()` **throws** an `AnthropicError` on schema-invalid/unparseable output (it does not return `parsed_output: null` for that case, contrary to a first read of the SDK's inline doc comment), and `parsed_output` is legitimately `null` only when there's no text content block at all (e.g. `stop_reason: "refusal"`) — all route to the same outcome: retried once, then the function returns `null`. This keeps `architecture.md` invariant 5 ("every citation validated against an actual retrieved chunk ID... never trusted unchecked") enforced server-side, before anything is returned, and reuses the same one-retry-then-fail contract code-standards.md already specifies for malformed output, rather than inventing a second retry policy.
6. **Two distinct "nothing useful to show" responses, matching `app-flow.md`'s two distinct states:**
   - **No-grounded-information (state 4):** HTTP 200, `{ grounded: false, answer: <fixed message>, citations: [] }`. Used both for the deterministic zero-retrieval case and the model's own `grounded: false` self-report.
   - **Generation failure (state 5, error):** HTTP 500, `{ error: <fixed plain message> }` — deliberately **not** shaped like `ChatResponseSchema`, so the future UI can tell "the KB genuinely has nothing" apart from "something broke," per `app-flow.md`'s two separate state definitions. Logged server-side with `console.error` (this project's `architecture.md` lists no error-monitoring service, unlike some other stacks — plain server logging is what's actually documented here).
7. **`lib/supabase/client.ts` is created now.** `architecture.md`'s folder structure has listed it since Spec 01 ("server-only client.ts") but nothing has needed it until this spec — `lib/kb/search.ts` is the first runtime module that queries Supabase. Single shared client, service-role key, server-only (never imported by `components/`).
8. **Query-time embedding duplicates a small amount of logic from `scripts/ingest-kb.ts`** (same model, same `openai.embeddings.create` call shape) rather than sharing a helper module. `scripts/` and `lib/` are intentionally separate boundaries (one-off ingestion vs. request-time serving — `architecture.md`), and the call shapes differ (batch array vs. single query string), so a shared abstraction would buy little. Accepted, not treated as a violation of any "no duplication" rule (none is documented).
9. **Request contract stays single-turn: `{ message: string }`.** No conversation history field yet. Multi-turn state (needed for `app-flow.md` Journey 2's escalation flip) is explicitly Spec 06+'s problem — adding it now would be scope creep ahead of the classifier that actually needs it, per `ai-workflow-rules.md`'s "don't invent behaviour beyond the active spec." `message` is capped at 2000 characters (a plain input-sanity guard, not from any spec — flagged as an arbitrary-but-reasonable default).

### Addendum: AI provider switched to OpenAI after initial implementation

Decisions 1, 2, and 5 above describe the *original* Anthropic-based design. After implementation, no Anthropic API key turned out to be available, so the provider was switched to OpenAI (`gpt-5.6-terra`) — see `progress-tracker.md` Architecture Decisions for the full reasoning, cost/latency comparison, and two bugs found and fixed during the switch (a pre-existing `lib/ai/prompts.ts` boundary violation, and a citation-metadata trust gap). The historical decisions above are left as written rather than rewritten, since they document real reasoning that was valid at the time — `architecture.md` and this file's Status/Verify checklist below reflect the current, correct state.

## Scope

**In scope:**

- `lib/supabase/client.ts` — single shared server-only Supabase client (service-role key).
- `lib/kb/search.ts` — `searchKb(query: string): Promise<RetrievedChunk[]>`:
  1. Embed `query` via OpenAI `text-embedding-3-small` (same model as ingestion, 1536 dims).
  2. Call `match_kb_chunks(query_embedding, match_count: 5, min_similarity: 0.2)`.
  3. Fetch the `kb_sources` rows (`title`, `source_name`, `source_url`) for the distinct `source_id`s returned, join client-side into the result (the RPC only returns `kb_chunks` columns — confirmed by reading the migration).
- `lib/ai/schema.ts` — `ChatResponseSchema`: `{ grounded: boolean, answer: string, citations: { chunk_id: string, source_title: string, source_name: string, source_url: string | null }[] }`. No escalation fields (Spec 06), no `simple_version`/`pidgin_version` fields (Spec 09) — base schema only.
- `lib/ai/prompts.ts` — system prompt encoding: never diagnose/prescribe/give dosages (hard invariant 2); answer only from the provided chunks, set `grounded: false` if they don't adequately answer the specific question; cite every claim using only the provided `chunk_id`s; plain, accessible language matching `project-overview.md`'s persona. User-turn prompt: the retrieved chunks (id + source title + content) formatted as context, followed by the user's question.
- `lib/ai/client.ts` — Anthropic client instance + `generateAnswer(query, retrievedChunks): Promise<ChatResponse | null>` implementing Decision 5's parse-and-validate-with-one-retry contract.
- `app/api/chat/route.ts` — `POST` handler: validate request body (zod, local to the route) → `searchKb` → zero-results short-circuit → `generateAnswer` → return `ChatResponseSchema` JSON (200) or the generic error body (500).

**Out of scope (do not build in this spec):**

- Any urgency classification, red-flag matching, or escalation card fields — Spec 06.
- `simple_version` / `pidgin_version` fields or any toggle logic — Spec 09.
- Conversation history / multi-turn state — needed starting Spec 06, not here (Decision 9).
- Any UI component (`components/chat/*`) — Spec 07 builds these against mock data; Spec 08 wires them to this real endpoint.
- `lib/directory/lookup.ts` — Spec 06.
- `GET /api/services` — separate route, not part of this unit per `architecture.md`'s folder listing.

## Files to create / modify

- `lib/supabase/client.ts`
- `lib/kb/search.ts`
- `lib/ai/schema.ts`
- `lib/ai/prompts.ts`
- `lib/ai/client.ts`
- `app/api/chat/route.ts`
- No `architecture.md` changes needed — every file above was already named in its folder structure since Spec 01; no `.env.example` changes — all required vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) already exist from Specs 01–04.

## Steps

1. Write `lib/supabase/client.ts` — `createClient` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `process.env` (Next.js loads `.env.local` automatically for server code — no `loadEnvFile` needed here, that was only for the standalone `scripts/` runners).
2. Write `lib/ai/schema.ts` — `ChatResponseSchema` per Scope above, exported type `ChatResponse`.
3. Write `lib/kb/search.ts` — `RetrievedChunk` type + `searchKb()` per Scope above.
4. Write `lib/ai/prompts.ts` — `buildSystemPrompt()` and a function that turns `(query, RetrievedChunk[])` into the messages array for `messages.parse()`.
5. Write `lib/ai/client.ts` — Anthropic client + `generateAnswer()` implementing Decision 5 (parse, cross-check citations against the retrieved set, one retry, `null` on repeated failure).
6. Write `app/api/chat/route.ts`:
   - Zod-validate the request body (`{ message: string }`, 1–2000 chars).
   - `searchKb(message)`.
   - If empty → return the no-grounded-information response (Decision 6).
   - Else `generateAnswer(message, chunks)`.
   - If `null` → HTTP 500 generic error body (Decision 6), `console.error` logged server-side.
   - Else → HTTP 200, the validated `ChatResponse`.
7. Verify with `curl` against `npm run dev` (no UI exists yet):
   - A question with strong KB coverage (e.g. malaria symptoms) → `grounded: true`, non-empty `citations`, every `chunk_id` traceable to a real `kb_chunks` row from Spec 03's ingestion, `source_title`/`source_name`/`source_url` correct.
   - A question outside the KB's 12 topics (e.g. diabetes management) → `grounded: false`, empty `citations`, HTTP 200 — confirm via a direct `match_kb_chunks` query whether this hit the deterministic zero-retrieval path or the model's own self-report, and note which.
   - Missing/empty/oversized `message` → HTTP 400.
   - Malformed-response fallback (HTTP 500 path): code-reviewed for correctness (retry-then-null logic, citation cross-check), not force-reproduced live — deliberately triggering a genuine malformed response requires mocking the model, out of scope for a curl smoke test. Deferred to the Spec 11 test-set to exercise naturally over more queries.

## New dependencies

None. `@anthropic-ai/sdk` (`messages.parse` + `zodOutputFormat` helper, confirmed present in the installed `0.120.0`), `openai`, `@supabase/supabase-js`, and `zod` are all already dependencies (Specs 01–04).

## Status: COMPLETE

Fully implemented and live-verified end to end, on OpenAI (see Addendum above) after the provider switch.

## Verify checklist

- [x] `lib/supabase/client.ts`, `lib/kb/search.ts`, `lib/ai/schema.ts`, `lib/ai/prompts.ts`, `lib/ai/client.ts`, `app/api/chat/route.ts` written
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [x] **Strong-coverage query returns `grounded: true` with real, traceable citations** — verified live via curl (malaria symptoms in a child): real `chunk_id`s matching live `kb_chunks` rows, and `source_title`/`source_name`/`source_url` all correct (`source_url` matches the live `kb_sources` row exactly — this required a mid-verification bug fix, see the citation-metadata note in `progress-tracker.md`)
- [x] Out-of-KB query returns `grounded: false`, empty citations, HTTP 200 — verified live via curl (`"What is the airspeed velocity of an unladen swallow?"`) — confirmed as the **deterministic zero-retrieval path** (`chunks.length === 0`), not a model self-report, since no generation call happens on this path at all
- [x] Invalid request body returns HTTP 400 — verified live via curl (`{}`)
- [x] Malformed/bad-citation fallback path — code-reviewed against the OpenAI-equivalent contract (broad catch around `chat.completions.parse()`, one retry, `null` on repeated failure); additionally exercised live earlier in the process (before the provider switch was complete) as a side effect of an invalid key at the time — confirmed the retry-then-fallback plumbing degrades cleanly (HTTP 500, no crash, no leaked stack trace)
- [x] No `SELECT *` anywhere (code-standards.md)
- [x] No hardcoded server secret outside `lib/*`/`app/api/*` server modules; nothing under `components/` touched (none exists yet for this spec anyway)
- [x] No invariant in `architecture.md` or `code-standards.md` violated — in particular invariants 1, 2, and 5 (invariant 5 specifically re-verified after the citation-metadata fix — citation metadata is now server-reconstructed, never trusted from the model)
- [x] `progress-tracker.md` updated: Spec 05 marked complete, provider-switch reasoning and both bugs found/fixed logged under Architecture Decisions

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table:
- `progress-tracker.md` — mark complete, log the model/retry/cutoff decisions above under Architecture Decisions, note actual curl verification results
- No `architecture.md`, `database-schema.md`, `app-flow.md`, `ui-context.md`, or `code-standards.md` changes anticipated — this spec implements what they already specify rather than introducing new stack, schema, screens, tokens, or conventions
