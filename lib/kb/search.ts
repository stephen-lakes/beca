/**
 * lib/kb/search.ts — runtime KB retrieval only (architecture.md).
 *
 * Embeds the query, calls match_kb_chunks (Spec 02), and joins in the
 * kb_sources metadata needed for citations. Never fetches from who.int —
 * that's scripts/ingest-kb.ts's job, at ingest time only.
 */

import OpenAI from "openai"
import { supabase } from "@/lib/supabase/client"

const EMBEDDING_MODEL = "text-embedding-3-small"

// See context/specs/05-rag-chat-api.md Decision 4: similarity here is
// 1 - cosine_distance (confirmed by reading supabase/migrations/0001_init.sql
// directly), higher is better. Flagged as tunable, not final.
const MATCH_COUNT = 5
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
  sourceTitle: string
  sourceName: string
  sourceUrl: string | null
}

interface MatchKbChunksRow {
  id: string
  source_id: string
  content: string
  chunk_index: number
  similarity: number
}

async function embedQuery(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: query })
  const embedding = response.data[0]?.embedding
  if (!embedding) {
    throw new Error("OpenAI embeddings response contained no embedding for the query")
  }
  return embedding
}

export async function searchKb(query: string): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedQuery(query)

  const { data: chunkRows, error: matchError } = await supabase.rpc("match_kb_chunks", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    min_similarity: MIN_SIMILARITY,
  })
  if (matchError) {
    throw new Error(`match_kb_chunks failed: ${matchError.message}`)
  }

  const rows = (chunkRows ?? []) as MatchKbChunksRow[]
  if (rows.length === 0) {
    return []
  }

  const sourceIds = [...new Set(rows.map((row) => row.source_id))]
  const { data: sourceRows, error: sourcesError } = await supabase
    .from("kb_sources")
    .select("id, title, source_name, source_url")
    .in("id", sourceIds)
  if (sourcesError) {
    throw new Error(`Failed fetching kb_sources for citation metadata: ${sourcesError.message}`)
  }

  const sourceById = new Map((sourceRows ?? []).map((source) => [source.id, source]))

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
      sourceTitle: source.title,
      sourceName: source.source_name,
      sourceUrl: source.source_url,
    }
  })
}
