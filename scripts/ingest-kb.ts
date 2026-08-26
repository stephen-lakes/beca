/**
 * scripts/ingest-kb.ts — Spec 03: KB ingestion script
 *
 * One-off, dev-time script. Fetches the 12 WHO fact-sheet topics listed in
 * data/kb_topics.json, extracts clean article text, chunks it, embeds each
 * chunk (OpenAI text-embedding-3-small, 1536 dims), and stores the result in
 * kb_sources / kb_chunks.
 *
 * Per architecture.md's system boundaries: this is the only thing that
 * fetches from who.int. It never runs at request time — the KB is
 * pre-ingested, not live-fetched on each chat turn.
 *
 * Usage: npm run ingest-kb
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { z } from "zod"
import * as cheerio from "cheerio"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { encode, decode } from "gpt-tokenizer/model/text-embedding-3-small"

// ---------------------------------------------------------------------------
// Env — loaded from .env.local (never committed; see .gitignore)
// ---------------------------------------------------------------------------

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"))
} catch {
  // .env.local not found or unreadable — assume the env vars are already
  // set some other way (shell export, CI secrets, etc).
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name} (check .env.local)`)
  }
  return value
}

const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY")

// ---------------------------------------------------------------------------
// Config — chunking + fetch (see context/specs/03-kb-ingestion.md "Decisions")
// ---------------------------------------------------------------------------

const CHUNK_SIZE_TOKENS = 400
const CHUNK_OVERLAP_TOKENS = 50
const EMBEDDING_MODEL = "text-embedding-3-small"
const EMBEDDING_BATCH_SIZE = 96

// A browser-like UA avoids some bot-blocking on who.int; a real WHO fact
// sheet renders several thousand characters of article text, so a short
// extraction is treated as a failed fetch rather than stored silently.
const FETCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
const ARTICLE_SELECTOR = "article.sf-detail-body-wrapper"
const MIN_EXTRACTED_TEXT_LENGTH = 200

// ---------------------------------------------------------------------------
// data/kb_topics.json — validated shape (code-standards.md: validate all
// external input with zod)
// ---------------------------------------------------------------------------

const KbTopicSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  category: z.string().min(1),
  source_name: z.string().min(1),
  source_url: z.url().nullable(),
  red_flag_linked: z.boolean(),
  notes: z.string().optional().default(""),
})
type KbTopic = z.infer<typeof KbTopicSchema>

const KbTopicsFileSchema = z.array(KbTopicSchema)

// Content for topic #12 ("How to prepare for a clinic or hospital
// appointment") — internally authored, source_url is null, nothing to
// fetch. Per kb_topics.json's note: "write this ourselves as a short
// checklist and label it clearly as team-authored in the UI, not a cited
// external fact" (the UI-side labeling is a later spec's job, not this one).
const INTERNALLY_AUTHORED_CONTENT: Record<number, string> = {
  12: `How to prepare for a clinic or hospital appointment

Before you go

Write down your main symptom or concern in one or two sentences. If you are going for someone else, write down their symptoms too.

Note when the symptom started, and whether it has been getting better, worse, or staying the same.

List any medicines you are currently taking, including the dose if you know it.

Bring your ID and, if you have one, your previous hospital or clinic card or folder number.

Bring any past test results, scan reports, or prescriptions related to this visit.

If the visit is for a child, bring their vaccination card if you have it.

Write down any questions you want to ask, so you don't forget them once you're with the health worker.

At the clinic

Arrive early if you can — some clinics see patients in the order they arrive, not only by appointment time.

Tell the health worker your main concern first, before other smaller issues, so it doesn't get missed if time is short.

It's okay to ask the health worker to explain anything in simpler terms if you don't understand.

Ask what to do next: whether you need to come back, what warning signs mean you should return sooner, and how to take any medicine prescribed.

After the visit

Keep any new prescriptions, receipts, or notes together in one place for next time.

If you were told to come back or watch for specific symptoms, write those down somewhere you'll see them, like a note on your phone.`,
}

// ---------------------------------------------------------------------------
// Fetch + extract
// ---------------------------------------------------------------------------

async function fetchArticleText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": FETCH_USER_AGENT } })
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)
  const article = $(ARTICLE_SELECTOR)
  if (article.length === 0) {
    throw new Error(
      `Selector "${ARTICLE_SELECTOR}" matched no elements — WHO page structure may have changed`,
    )
  }

  // Walk block-level elements individually and join with blank lines,
  // rather than article.text(), so headings/paragraphs don't run together
  // into unreadable text (verified against a live fetch during spec work).
  const blocks: string[] = []
  article.find("h1, h2, h3, h4, p, li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim()
    if (text) blocks.push(text)
  })
  const text = blocks.join("\n\n")

  if (text.length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new Error(
      `Extracted text suspiciously short (${text.length} chars) — likely a bad extraction, not stored`,
    )
  }
  return text
}

// ---------------------------------------------------------------------------
// Chunk — fixed-size token window with overlap
// ---------------------------------------------------------------------------

function chunkText(text: string): string[] {
  const tokens = encode(text)
  if (tokens.length === 0) return []

  const chunks: string[] = []
  const step = CHUNK_SIZE_TOKENS - CHUNK_OVERLAP_TOKENS
  let start = 0

  while (start < tokens.length) {
    const end = Math.min(start + CHUNK_SIZE_TOKENS, tokens.length)
    chunks.push(decode(tokens.slice(start, end)).trim())
    if (end === tokens.length) break
    start += step
  }

  return chunks.filter((chunk) => chunk.length > 0)
}

// ---------------------------------------------------------------------------
// Embed
// ---------------------------------------------------------------------------

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

async function embedChunks(chunks: string[]): Promise<number[][]> {
  const embeddings: number[][] = []
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE)
    const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch })
    for (const item of response.data) {
      embeddings.push(item.embedding)
    }
  }
  return embeddings
}

// ---------------------------------------------------------------------------
// Store — self-contained Supabase client (see spec: lib/supabase/ doesn't
// exist yet and is reserved for the running app's server-only client)
// ---------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function clearExisting(): Promise<void> {
  // Re-runnable by design: this is a one-shot dev-time tool, not
  // idempotent-by-upsert application code. kb_chunks cascades from
  // kb_sources (ON DELETE CASCADE, database-schema.md).
  const { error } = await supabase.from("kb_sources").delete().not("id", "is", null)
  if (error) {
    throw new Error(`Failed clearing existing kb_sources: ${error.message}`)
  }
}

async function insertSource(topic: KbTopic): Promise<string> {
  const { data, error } = await supabase
    .from("kb_sources")
    .insert({
      title: topic.title,
      category: topic.category,
      source_name: topic.source_name,
      source_url: topic.source_url,
      red_flag_linked: topic.red_flag_linked,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(`Failed inserting kb_sources row for "${topic.title}": ${error?.message}`)
  }
  return data.id as string
}

async function insertChunks(sourceId: string, chunks: string[], embeddings: number[][]): Promise<void> {
  const rows = chunks.map((content, index) => ({
    source_id: sourceId,
    content,
    embedding: embeddings[index],
    chunk_index: index,
  }))

  const { error } = await supabase.from("kb_chunks").insert(rows)
  if (error) {
    throw new Error(`Failed inserting kb_chunks for source ${sourceId}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function ingestTopic(topic: KbTopic): Promise<{ chunkCount: number }> {
  const text =
    topic.source_url !== null ? await fetchArticleText(topic.source_url) : INTERNALLY_AUTHORED_CONTENT[topic.id]

  if (!text) {
    throw new Error(
      `No content available for topic #${topic.id} ("${topic.title}") — missing INTERNALLY_AUTHORED_CONTENT entry`,
    )
  }

  const chunks = chunkText(text)
  if (chunks.length === 0) {
    throw new Error(`Chunking produced 0 chunks for topic #${topic.id} ("${topic.title}")`)
  }

  const embeddings = await embedChunks(chunks)
  const sourceId = await insertSource(topic)
  await insertChunks(sourceId, chunks, embeddings)

  return { chunkCount: chunks.length }
}

async function main(): Promise<void> {
  const rawTopics = JSON.parse(readFileSync(path.join(process.cwd(), "data/kb_topics.json"), "utf-8"))
  const topics = KbTopicsFileSchema.parse(rawTopics)

  console.log(`Loaded ${topics.length} topics from data/kb_topics.json`)
  console.log("Clearing existing kb_sources/kb_chunks rows...")
  await clearExisting()

  const failures: { topic: KbTopic; error: unknown }[] = []
  let totalChunks = 0

  for (const topic of topics) {
    process.stdout.write(`[${topic.id}/${topics.length}] ${topic.title} ... `)
    try {
      const { chunkCount } = await ingestTopic(topic)
      totalChunks += chunkCount
      console.log(`ok (${chunkCount} chunks)`)
    } catch (error) {
      console.log("FAILED")
      failures.push({ topic, error })
    }
  }

  console.log("")
  console.log(`Done. ${topics.length - failures.length}/${topics.length} topics ingested, ${totalChunks} chunks total.`)

  if (failures.length > 0) {
    console.error("")
    console.error(`${failures.length} topic(s) failed:`)
    for (const { topic, error } of failures) {
      console.error(`  - #${topic.id} "${topic.title}": ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exitCode = 1
})
