# Spec 19 — Hybrid retrieval, constrained query expansion, fallback diagnostics

## Status: COMPLETE — implemented and verified live against the real Supabase/OpenAI backend (2026-08-27/28).

This is "Phase 1" from the 2026-08-27 architecture audit (see `progress-tracker.md`'s Completed entry and Architecture Decisions for that date). Phase 0 (KB expansion, 12 → 21 topics) is already implemented and verified. Phase 2 (labeled retrieval eval + empirically-tuned thresholds + health-education intent/topic classification ahead of retrieval) is intentionally not part of this spec — see Out of scope below.

## Goal

Make retrieval itself more robust to paraphrase and partial keyword overlap — not by loosening the similarity cutoff, but by giving a second, independent retrieval channel (Postgres full-text search) a chance to rescue a chunk the vector search alone would miss or under-rank — and make the existing "no grounded information" fallback diagnosable in logs (which of the A–E cases in the audit actually happened), without changing any user-facing response shape.

## Depends on

Spec 05 (`lib/kb/search.ts`, `match_kb_chunks`, `app/api/chat/route.ts`) and the 2026-08-27 KB expansion (Phase 0) — this spec reuses the `keywords` field Phase 0 added to `data/kb_topics.json` for every topic.

## Decisions (both judgment calls below confirmed by the project owner on 2026-08-27, both drafted defaults accepted as-is — see the ✅ markers)

1. **Kept as one spec, not split further.** Touches a new migration, `scripts/ingest-kb.ts`, `lib/kb/search.ts`, and `app/api/chat/route.ts` — more files than most specs, but all serve one coherent flow (retrieval), involve zero UI, and never cross into the urgency-classifier's territory. `ai-workflow-rules.md`'s actual splitting triggers are UI-vs-API-route and RAG-vs-classifier, neither of which applies here — this mirrors Spec 05's own precedent of spanning `lib/supabase`, `lib/kb`, `lib/ai`, and the route in one unit.

2. **Hybrid mechanism: Postgres full-text search alongside the existing pgvector search, not a new database.** Per the audit's own steer (and `database-schema.md`'s "no cache layer... no file storage" minimalism), a new migration (`supabase/migrations/0002_hybrid_search.sql` — `0001` stays untouched, per the protected-migrations rule) adds:
   - `kb_chunks.content_tsv` — a generated `tsvector` column (`to_tsvector('english', content)`), plus a GIN index.
   - `kb_sources.keywords text[]` — populated from `data/kb_topics.json`'s `keywords` field at ingest time (Decision 3 needs this).
   - A new SQL function, `match_kb_chunks_hybrid(query_embedding vector(1536), query_text text, match_count int, min_similarity float)`, replacing `match_kb_chunks` as the one `lib/kb/search.ts` calls (the old function stays in the DB, unused — not dropped, since dropping a function isn't a "new migration" in the additive spirit the existing pooler/migration notes describe). It:
     - Runs the same vector search as today (`1 - cosine_distance >= min_similarity`).
     - Separately runs `plainto_tsquery('english', query_text)` against `content_tsv`, ranked by `ts_rank`.
     - Unions both by chunk id. A chunk that matches keyword search but falls *below* `min_similarity` on the vector side is still included, up to a small reserved slot — this is the actual mechanism that answers the audit's "no retrieved source ≠ no knowledge" concern for near-miss keyword phrasing.
     - Returns a `matched_via` column (`'vector' | 'keyword' | 'both'`) per row — consumed only for the Decision 4 log line, never shown to the user or the model.
   - ✅ **Confirmed by the project owner: `match_count` = 8 (up from 5), with up to 3 of those 8 reserved for keyword-only rescues.** Accepted as drafted — a reasonable starting point given no eval data exists yet (that's Phase 2), easy to retune later.

3. **Query expansion: bounded to curated `kb_topics.json` keywords, never LLM-generated.** An LLM query-rewrite step was considered and rejected: it risks injecting unsupported medical framing into what gets searched, which is in tension with this project's core "never guess" invariant even if the rewrite itself never reaches the user. Instead: `lib/kb/search.ts` checks the incoming message against every source's `keywords` array (persisted via Decision 2's new column) with a cheap case-insensitive containment/fuzzy check, and folds any matched source's keywords into the **keyword-search input only** (never the vector embedding input — the embedding model already handles paraphrase reasonably well on its own; skewing it with a keyword list risks biasing it toward one topic over the genuinely-best match). This keeps expansion bounded to a human-authored, already-reviewed vocabulary (the same `keywords` a person can read and edit in `data/kb_topics.json`), not open-ended generation.
   - ✅ **Confirmed by the project owner: keyword-containment approach, as drafted** — not the constrained-LLM-call alternative. That alternative (an LLM call restricted to a fixed enum of existing topic `slug`s) stays noted as a deferred fallback, worth revisiting only if the keyword-containment approach proves measurably too weak once this ships — no evidence either way yet, not built speculatively.

4. **Fallback diagnostics: structured console logging only, no new DB table.** Does not reopen `database-schema.md`'s existing "`query_log` deliberately not created, deferred" stance. `app/api/chat/route.ts` gains one log line at each of its three no-answer exit points, distinguishing the audit's A–E cases (never raw message text — hard invariant 4 stays intact throughout):
   - `retrieval_outcome: "D_no_match"` — hybrid retrieval returned zero rows on both channels → likely a genuine KB-coverage gap (the case that caused the originally-reported bug).
   - `retrieval_outcome: "C_insufficient_evidence"` — rows were retrieved, but the model itself set `grounded: false` (today's existing self-report path, unchanged) → the topic likely exists but doesn't answer the specific question asked.
   - `retrieval_outcome: "B_retrieval_error"` — the hybrid RPC call itself threw. **New:** `searchKb` isn't currently wrapped in a try/catch in the route — an exception there today surfaces as an unhandled framework error, indistinguishable in logs from any other crash. This spec adds that try/catch, returning the same existing `GENERATION_FAILURE_MESSAGE`/500 shape (no user-facing behavior change), purely so this case becomes loggable and distinguishable from D.
   - Each log line carries `message.length`, the top similarity/rank score(s) if any, and which channel(s) matched — diagnostic numbers only.

5. **Similarity threshold unchanged.** `MIN_SIMILARITY: 0.2` stays exactly as-is on the vector side; only the new keyword-rescue slot count is being introduced (and flagged tunable, Decision 2). Empirically retuning `MIN_SIMILARITY` itself needs a labeled eval set first — that's Phase 2, explicitly not reopened here.

6. **No intent/topic classifier added ahead of retrieval in this spec.** This spec only makes retrieval smarter and makes the existing fallback legible in logs. Classifying the question's intent/topic before retrieval is Phase 2.

## Scope

**In scope:**

- `supabase/migrations/0002_hybrid_search.sql` — new migration: `kb_chunks.content_tsv` generated column + GIN index; `kb_sources.keywords text[]`; `match_kb_chunks_hybrid` function.
- `scripts/ingest-kb.ts` — `insertSource` additionally writes `keywords` (already present on every `KbTopic` since Phase 0) to the new column.
- `lib/kb/search.ts` — `searchKb()` calls `match_kb_chunks_hybrid` instead of `match_kb_chunks`; adds the keyword-containment expansion step (Decision 3); returns enough diagnostic info (top score(s), `matched_via` summary, zero-vs-nonzero) for the route to build its Decision 4 log line without re-querying anything.
- `app/api/chat/route.ts` — try/catch around the `searchKb` call (case B); one log line at each of the three existing no-answer exit points (case B/C/D). **No change to any HTTP response shape, schema, or status code** — this is purely additive on the logging/robustness side.
- `database-schema.md` — document the two new columns and the new function, alongside the existing `match_kb_chunks` entry (left in place, unused).
- `architecture.md` — a line noting hybrid (vector + keyword) retrieval is now in use, under Storage model / System boundaries.

**Out of scope (explicitly deferred, not silently dropped):**

- Reranking as a distinct third stage — not justified without evidence hybrid retrieval alone is insufficient.
- Labeled precision/recall eval set and empirically-tuned `MIN_SIMILARITY`/`match_count` (Phase 2).
- Health-education intent/topic classification ahead of retrieval (Phase 2).
- Any UI/component change — zero client-visible behavior change is intended beyond (hopefully) fewer false "no grounded information" refusals on paraphrased questions.
- A `query_log` table or any other persistence for the new diagnostics — console logging only, per Decision 4.
- Re-running/re-verifying the urgency classifier or escalation branch — untouched by this spec.

## Files to create / modify

- `supabase/migrations/0002_hybrid_search.sql` (new)
- `scripts/ingest-kb.ts`
- `lib/kb/search.ts`
- `app/api/chat/route.ts`
- `database-schema.md`
- `architecture.md`

## Steps

1. Write and apply `0002_hybrid_search.sql` against the real Supabase project, via a throwaway migration-runner script (`pg` `Client`, deleted after use — not committed, same disposable-tool pattern Spec 11's diagnostic script used) connecting through `SUPABASE_DB_URL` (the already-configured Transaction-mode pooler, port 6543 — same pooler string that successfully applied `0001_init.sql`, per the existing note in `progress-tracker.md`'s Architecture Decisions) — verified live via direct `information_schema`/`pg_indexes`/`pg_proc` queries and a real RPC smoke-test call, not just "no error thrown."
2. Update `scripts/ingest-kb.ts`'s `insertSource` to also write `keywords`; re-run ingestion for all 21 topics (a full re-run, not scoped — every row's `keywords` column needs backfilling, and the script is already designed to be safely re-runnable per its existing `clearExisting()`/scoped-run precedent).
3. Rewrite `lib/kb/search.ts`: call `match_kb_chunks_hybrid`, add the keyword-containment expansion step, return the diagnostic fields the route needs.
4. Update `app/api/chat/route.ts`: wrap `searchKb` in try/catch; add the three `retrieval_outcome` log call sites (D at the existing zero-result short-circuit, C at the existing model-self-reports-`grounded:false` path, B at the new catch block).
5. Verify live via curl:
   - Re-run Spec 11's full 20-query test set — expect no regression (100.0%/100.0%, unchanged).
   - Re-test the originally-reported query and a deliberately more-awkward paraphrase of it (e.g. something that shares few exact words with the physical-activity source) to check whether the keyword-rescue path measurably helps versus the current vector-only behavior.
   - Confirm the out-of-KB refusal and escalation paths are still unaffected.
   - Inspect server logs directly for at least one real occurrence of each of the three new `retrieval_outcome` values, not just code review.
6. Update `progress-tracker.md` (mark this spec complete, log real verification results), `database-schema.md`, `architecture.md`.

## New dependencies

**`pg` + `@types/pg` (devDependencies).** Postgres full-text search itself (`tsvector`/`ts_rank`/GIN) needs no new package — it's built into the Postgres/pgvector stack already in use. But *applying* `0002_hybrid_search.sql` required a raw Postgres connection (via `SUPABASE_DB_URL`), and neither a `psql` binary nor any Postgres client library existed anywhere in this environment or this project's dependencies — `scripts/ingest-kb.ts`/`seed-directory.ts` only ever used `@supabase/supabase-js`, which has no generic raw-SQL/DDL execution path. `pg` is the standard Node Postgres client, used only by a small one-off migration-runner script (not committed — see Steps below), never imported by any runtime app code. Recorded here per `code-standards.md` hard invariant 5.

## Verify checklist

- [x] `0002_hybrid_search.sql` applied and live-verified (columns, index, function) — confirmed directly via `information_schema`/`pg_indexes`/`pg_proc` queries and a real RPC smoke-test call, not just "no error thrown"
- [x] `scripts/ingest-kb.ts` re-run for all 21 topics — 115 chunks total (unchanged from pre-Spec-19, confirming no content drift), `kb_sources.keywords` populated for every row
- [x] `lib/kb/search.ts` calls `match_kb_chunks_hybrid`; keyword expansion exercised live against a deliberately awkward paraphrase ("Does moving your body a lot help you stay well long term?" — few words shared with the physical-activity source) — returned `grounded: true` with the correct citation
- [x] `app/api/chat/route.ts`: try/catch added around `searchKb`; **case D (`D_no_match`) confirmed live** in the real server log for an out-of-KB query, logging `message.length` only, never message text (hard invariant 4 spot-checked directly in the log line). Case C (`C_insufficient_evidence`) is code-reviewed, not forced live this pass — it fires directly off the existing, already-live-verified `result.grounded` field, and both real grounded queries tested correctly did *not* trigger it. Case B (`B_retrieval_error`) is code-reviewed only — deliberately breaking the DB/embedding call to force it live (the technique Spec 06 used for the classifier-failure path) wasn't done this pass; flagged explicitly rather than assumed, same standard this tracker applies elsewhere.
- [x] No HTTP response shape, status code, or schema changed anywhere — confirmed by re-running Spec 11's test set with no regression: **100.0% overall (20/20), 100.0% escalated (7/7)**, identical to the pre-Spec-19 result
- [x] `npx tsc --noEmit` clean, `npm run lint` clean, `npm run dev` starts cleanly
- [x] No invariant in `architecture.md` or `code-standards.md` violated
- [x] `progress-tracker.md`, `database-schema.md`, `architecture.md` updated

## Docs to update after this spec

Per `ai-workflow-rules.md`'s sync table: `database-schema.md` (new table columns + function), `architecture.md` (hybrid retrieval now in use), `progress-tracker.md` (mark complete, log real verification results under Architecture Decisions).
