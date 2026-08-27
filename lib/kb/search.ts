/**
 * lib/kb/search.ts — runtime KB retrieval only (architecture.md).
 *
 * Embeds the query, calls match_kb_chunks_hybrid (Spec 19; replaces Spec 02's
 * match_kb_chunks), and joins in the kb_sources metadata needed for
 * citations. Never fetches from who.int — that's scripts/ingest-kb.ts's job,
 * at ingest time only.
 *
 * Spec 19: retrieval is now hybrid (pgvector search + a small Postgres
 * full-text-search rescue for chunks the vector search alone would miss or
 * under-rank), and the keyword search is expanded — before the DB call —
 * using each source's curated `keywords` (data/kb_topics.json, persisted to
 * kb_sources by scripts/ingest-kb.ts). See
 * context/specs/19-hybrid-retrieval-fallback-diagnostics.md Decisions 2-3.
 */

import OpenAI from "openai"
import { supabase } from "@/lib/supabase/client"

const EMBEDDING_MODEL = "text-embedding-3-small"

// See context/specs/05-rag-chat-api.md Decision 4: similarity here is
// 1 - cosine_distance (confirmed by reading supabase/migrations/0001_init.sql
// directly), higher is better. Flagged as tunable, not final.
//
// Spec 19 Decision 2 (confirmed 2026-08-27): MATCH_COUNT raised 5 -> 8, with
// up to 3 of those 8 reserved inside match_kb_chunks_hybrid for keyword-only
// rescues (chunks that pass the full-text search but not the vector
// min_similarity cutoff). MIN_SIMILARITY is unchanged — retuning it needs a
// labeled eval set first (Phase 2, not this spec).
const MATCH_COUNT = 8
const MIN_SIMILARITY = 0.2

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name} (check .env.local)`)
  }
  return value
}

const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })

export interface RetrievedChunk {
  chunkId: string
  sourceId: string
  content: string
  similarity: number
  // Spec 19: which retrieval channel surfaced this chunk — 'vector' (the
  // existing similarity-cutoff path) or 'keyword' (a full-text-search rescue
  // that did not clear the vector cutoff on its own). Diagnostic only: never
  // shown to the user or the model, consumed by app/api/chat/route.ts's
  // retrieval_outcome logging (Decision 4).
  matchedVia: "vector" | "keyword"
  sourceTitle: string
  sourceName: string
  sourceUrl: string | null
}

interface MatchKbChunksHybridRow {
  id: string
  source_id: string
  content: string
  chunk_index: number
  similarity: number
  matched_via: string
}

interface KbSourceRow {
  id: string
  title: string
  source_name: string
  source_url: string | null
  keywords: string[]
}

async function embedQuery(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: query })
  const embedding = response.data[0]?.embedding
  if (!embedding) {
    throw new Error("OpenAI embeddings response contained no embedding for the query")
  }
  return embedding
}

// Spec 19 Decision 3: bounded, deterministic expansion — never an LLM
// rewrite. If the raw message contains any of a source's curated keywords,
// that source's *entire* keyword list is folded into the full-text-search
// query text (never the vector embedding input — the embedding model
// already handles paraphrase reasonably well on its own, and skewing it with
// a keyword list risks biasing it toward one topic over the genuinely-best
// match). This broadens the keyword channel beyond the exact words the user
// typed, using only a human-authored, already-reviewed vocabulary.
function expandQueryTextForKeywordSearch(message: string, allSources: KbSourceRow[]): string {
  const lowerMessage = message.toLowerCase()
  const expansionTerms = new Set<string>()

  for (const source of allSources) {
    const sourceMentioned = source.keywords.some(
      (keyword) => keyword.length > 0 && lowerMessage.includes(keyword.toLowerCase()),
    )
    if (sourceMentioned) {
      for (const keyword of source.keywords) expansionTerms.add(keyword)
    }
  }

  if (expansionTerms.size === 0) return message
  return `${message} ${[...expansionTerms].join(" ")}`
}

export async function searchKb(query: string): Promise<RetrievedChunk[]> {
  const [queryEmbedding, sourceRows] = await Promise.all([
    embedQuery(query),
    (async () => {
      const { data, error } = await supabase
        .from("kb_sources")
        .select("id, title, source_name, source_url, keywords")
      if (error) {
        throw new Error(`Failed fetching kb_sources: ${error.message}`)
      }
      return (data ?? []) as KbSourceRow[]
    })(),
  ])

  const sourceById = new Map(sourceRows.map((source) => [source.id, source]))
  const expandedQueryText = expandQueryTextForKeywordSearch(query, sourceRows)

  const { data: chunkRows, error: matchError } = await supabase.rpc("match_kb_chunks_hybrid", {
    query_embedding: queryEmbedding,
    query_text: expandedQueryText,
    match_count: MATCH_COUNT,
    min_similarity: MIN_SIMILARITY,
  })
  if (matchError) {
    throw new Error(`match_kb_chunks_hybrid failed: ${matchError.message}`)
  }

  const rows = (chunkRows ?? []) as MatchKbChunksHybridRow[]
  if (rows.length === 0) {
    return []
  }

  return rows.map((row) => {
    const source = sourceById.get(row.source_id)
    if (!source) {
      throw new Error(`kb_chunks row ${row.id} references missing kb_sources row ${row.source_id}`)
    }
    return {
      chunkId: row.id,
      sourceId: row.source_id,
      content: row.content,
      similarity: row.similarity,
      matchedVia: row.matched_via === "keyword" ? "keyword" : "vector",
      sourceTitle: source.title,
      sourceName: source.source_name,
      sourceUrl: source.source_url,
    }
  })
}
