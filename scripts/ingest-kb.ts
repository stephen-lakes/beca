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

// Post-audit (2026-08-27, architecture audit): kb_topics.json gained a set of
// classification/eval-support fields (slug, description, intents, keywords,
// related_topics, example_questions, authority_level, status) alongside the
// original ingestion fields below. None of these new fields are persisted to
// kb_sources or used by retrieval yet — that's later work (hybrid retrieval /
// topic filtering), deliberately out of scope for this pass. They're
// validated here anyway, not left as unchecked passthrough keys, so a
// malformed entry fails loudly at ingestion time rather than silently
// dropping data zod would otherwise strip as "unknown."
const KbTopicSchema = z.object({
  id: z.number(),
  slug: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  intents: z.array(z.string().min(1)).min(1),
  keywords: z.array(z.string().min(1)).min(1),
  related_topics: z.array(z.string().min(1)),
  example_questions: z.array(z.string().min(1)).min(1),
  source_name: z.string().min(1),
  source_url: z.url().nullable(),
  authority_level: z.enum(["primary", "secondary"]),
  status: z.enum(["active", "draft", "retired"]),
  red_flag_linked: z.boolean(),
  // Added in the preventive-health/preparation/navigation architecture pass
  // (2026-08-28, see context/specs/20-capability-router-and-navigation.md).
  // Optional, defaulting to [] — only the 7 topics added in that pass (22-28)
  // carry it; the original 21 are deliberately not retrofitted in this pass
  // (a larger, separate edit with no functional payoff yet — see the "Not
  // done this pass" note below). Same as intents/keywords/example_questions
  // before it: validated so a malformed entry fails loudly, but not
  // persisted to kb_sources or used by retrieval — retrieval stays
  // completely unchanged in this pass to protect the already-verified
  // Health Education path from any regression risk.
  capabilities: z.array(z.string().min(1)).optional().default([]),
  notes: z.string().optional().default(""),
})
type KbTopic = z.infer<typeof KbTopicSchema>

const KbTopicsFileSchema = z.array(KbTopicSchema)

// Content for topics #8, #12, and #29 — internally authored, source_url is
// null, nothing to fetch. Per kb_topics.json's notes: label clearly as
// team-authored/compiled in the UI, not a cited external fact (the UI-side
// labeling is a later spec's job, not this one).
//
// Topic #8 ("Safe drinking water — how to treat and store water at home")
// was added here during the post-Spec-11 content-gap fix: WHO's own
// drinking-water fact sheet is stats/policy-focused, not a household
// how-to (confirmed directly — see progress-tracker.md). Compiled from CDC
// household water treatment guidance and WHO's Household Water Treatment
// and Safe Storage program page (both cited in kb_topics.json's notes for
// this entry), not fetched live — same internally-authored pattern as #12.
const INTERNALLY_AUTHORED_CONTENT: Record<number, string> = {
  8: `Making your drinking water safe at home

If you're unsure your water is safe to drink, WHO and CDC recommend a three-step process.

1. Clean the water first

If the water looks cloudy or has visible dirt in it, treat it before disinfecting — dirt and cloudiness can shield germs from being killed. Either let it stand in a container for a few hours so heavy particles settle to the bottom, then carefully pour off the clearer water, or strain it through a clean, tightly-woven cloth to remove larger debris.

2. Disinfect the water

Choose one method:

Boiling: bring the water to a rolling boil — large bubbles breaking continuously — and keep it boiling for at least 1 minute. At high altitude, roughly above 2,000 metres (6,500 feet), boil for 3 minutes instead. Let it cool on its own before drinking.

Chlorine: add a chlorine product made for treating drinking water, following the dose on the product's label exactly — the right amount depends on how concentrated the product is. Stir it in and wait at least 30 minutes before drinking.

Filtration: use a water filter rated to remove both bacteria and parasites, such as a certified ceramic filter or a hollow-fibre membrane filter.

3. Store it safely

Treated water can become unsafe again if stored poorly. Keep it in a clean container with a narrow opening and a tight-fitting lid. Never dip cups, hands, or ladles into the storage container — pour from it, or use one fitted with a tap. Use the water reasonably soon after treating it, and don't top up a container of treated water with untreated water.

Compiled from WHO and CDC household water treatment guidance, not a single WHO fact sheet.`,
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

  // Topic #29 ("Nigeria's childhood immunization schedule") — added 2026-08-29
  // in response to a reported gap ("is my child due for vaccination?" / "what
  // antigens at 6 months?" both refused for lack of any schedule content).
  // Internally authored, same as #8/#12: nphcda.gov.ng returned HTTP 500 and
  // unicef.org/nigeria returned HTTP 403 on every attempt, so this is
  // compiled from secondary sources (Paediatric Association of Nigeria, Gavi
  // Zero-Dose Learning Hub) plus one live-verified WHO AFRO source for the
  // malaria vaccine dosing specifically — see kb_topics.json's own notes for
  // this entry for the full sourcing caveat.
  29: `Nigeria's childhood immunization schedule

Nigeria's National Primary Health Care Development Agency (NPHCDA) runs a national routine immunization schedule that gives children a set of vaccines for free at government health facilities, timed to specific ages from birth through 15 months.

At birth
BCG (protects against tuberculosis), the first dose of oral polio vaccine (OPV0), and the birth dose of hepatitis B vaccine.

At 6 weeks
Oral polio vaccine dose 1 (OPV1), the first dose of pentavalent vaccine (Penta1 — combined protection against diphtheria, tetanus, pertussis, hepatitis B, and Haemophilus influenzae type b), pneumococcal conjugate vaccine dose 1 (PCV1), and rotavirus vaccine dose 1 (Rota1).

At 10 weeks
OPV2, Penta2, PCV2, and Rota2.

At 14 weeks
OPV3, Penta3, PCV3, and inactivated polio vaccine (IPV).

At 5 months
The first dose of the malaria vaccine (R21).

At 6 months
The second dose of the malaria vaccine.

At 7 months
The third dose of the malaria vaccine.

At 9 months
The first dose of measles vaccine (MCV1), yellow fever vaccine, and meningitis A conjugate vaccine.

At 15 months
The second dose of measles vaccine (MCV2) and a malaria vaccine booster dose.

The malaria vaccine is a recent addition to Nigeria's routine schedule. National rollout began in December 2024 in Bayelsa and Kebbi States and is being phased in state by state through 2025 — so availability depends on where you are and when your local facility introduced it. Check with your health worker whether it's available at your clinic yet.

This schedule is a general guide, not a personal record. It cannot tell you whether a specific child is up to date — only the child's own immunization card, kept by the caregiver and updated at each visit, or a health worker checking that card, can confirm that.

Compiled from NPHCDA's published routine immunization schedule (via secondary reporting from the Paediatric Association of Nigeria and Gavi's Zero-Dose Learning Hub) and the WHO Regional Office for Africa's reporting on the malaria vaccine rollout — not fetched from a single live NPHCDA page (nphcda.gov.ng returned a server error on every page tried at the time this was compiled).`,
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

// Scoped-correction support, added post-Spec-11 for the content-gap fix
// (progress-tracker.md): kb_sources has no column linking back to
// kb_topics.json's numeric id, so a targeted "replace just topic N" run
// can't safely find its old row by category alone once titles/urls change
// (e.g. topic #8's category, "hygiene", is shared with topic #7). Rather
// than a fragile title-matching heuristic or a new migration just for a
// one-time correction, --replace-urls takes the OLD source_url(s) being
// retired explicitly — auditable, no guessing. Logs what it's about to
// delete before deleting it.
async function deleteBySourceUrls(urls: string[]): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from("kb_sources")
    .select("id, title, source_url")
    .in("source_url", urls)
  if (selectError) {
    throw new Error(`Failed looking up kb_sources rows to replace: ${selectError.message}`)
  }
  for (const row of existing ?? []) {
    console.log(`  removing existing source: "${row.title}" (${row.source_url})`)
  }
  if ((existing ?? []).length !== urls.length) {
    console.log(
      `  warning: expected to find ${urls.length} row(s) matching --replace-urls, found ${(existing ?? []).length}`,
    )
  }

  const { error } = await supabase.from("kb_sources").delete().in("source_url", urls)
  if (error) {
    throw new Error(`Failed deleting kb_sources rows for source_url(s) ${urls.join(", ")}: ${error.message}`)
  }
}

// e.g. --topics=2,8 → returns [2, 8]; absent → null (means "all topics").
function parseCliIdList(flagName: string): number[] | null {
  const arg = process.argv.find((a) => a.startsWith(`--${flagName}=`))
  if (!arg) return null
  return arg
    .slice(flagName.length + 3)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
}

// e.g. --replace-urls=https://a,https://b → returns ["https://a", "https://b"].
function parseCliStringList(flagName: string): string[] | null {
  const arg = process.argv.find((a) => a.startsWith(`--${flagName}=`))
  if (!arg) return null
  return arg
    .slice(flagName.length + 3)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
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
      // Spec 19: persisted for query-time keyword expansion in
      // lib/kb/search.ts — requires supabase/migrations/0002_hybrid_search.sql
      // (kb_sources.keywords) to already be applied.
      keywords: topic.keywords,
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
  const allTopics = KbTopicsFileSchema.parse(rawTopics)

  console.log(`Loaded ${allTopics.length} topics from data/kb_topics.json`)

  // --topics=<ids> / --replace-urls=<old urls>: scoped re-ingestion for a
  // targeted content correction (e.g. swapping one topic's source without
  // touching the other 11). Absent → unchanged full-run behavior.
  const topicIdFilter = parseCliIdList("topics")
  const replaceUrls = parseCliStringList("replace-urls")
  const topics = topicIdFilter ? allTopics.filter((topic) => topicIdFilter.includes(topic.id)) : allTopics

  if (topicIdFilter) {
    console.log(`Scoped run: only topic(s) ${topicIdFilter.join(", ")} (${topics.length} matched)`)
    if (replaceUrls && replaceUrls.length > 0) {
      console.log(`Deleting existing kb_sources row(s) matching ${replaceUrls.length} --replace-urls value(s)...`)
      await deleteBySourceUrls(replaceUrls)
    }
  } else {
    console.log("Clearing existing kb_sources/kb_chunks rows...")
    await clearExisting()
  }

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
