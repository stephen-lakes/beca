/**
 * lib/ai/client.ts — the only AI provider calls in this codebase
 * (code-standards.md: "lib/ai/ — nothing but AI provider calls, prompts,
 * schemas, classification").
 *
 * Provider: OpenAI (switched from Anthropic Claude — no Anthropic API key
 * available; consolidates to the single provider already in use for
 * embeddings since Spec 03. See progress-tracker.md Architecture Decisions
 * and architecture.md's stack table for the full reasoning).
 *
 * generateAnswer() implements the same contract Spec 05 originally
 * specified for Anthropic: parse structured output, cross-check citations
 * against the retrieved chunk set, retry once on any failure, return null
 * if it still fails. The exact failure modes differ by SDK — see the note
 * below, confirmed by reading the installed `openai` package's source
 * directly rather than assumed.
 */

import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import type { RetrievedChunk } from "@/lib/kb/search"
import { ModelOutputSchema, type ChatResponse, type Citation } from "@/lib/ai/schema"
import { buildMessages } from "@/lib/ai/prompts"

// gpt-5.6-terra: OpenAI's own positioning is "high-volume business tasks
// like customer support, internal tools and document analysis" — a good
// fit for document-grounded Q&A. "Competitive performance to GPT-5.5 while
// being 2x cheaper" per OpenAI's launch messaging. Not gpt-5.6-luna (the
// cheapest tier, positioned for lower-stakes drafting/summarization — this
// product's hard invariants around citation faithfulness and never
// fabricating grounded claims argue for the more capable mid-tier here)
// and not gpt-5.6-sol (flagship "hardest problems" tier — unnecessary cost
// for straightforward RAG QA). See progress-tracker.md for the full
// cost/latency comparison against the original claude-sonnet-5 plan.
const MODEL = "gpt-5.6-terra"
// Spec 09: raised from 2048 — three text fields (answer, simple_version,
// pidgin_version) are now generated per call instead of one. The two new
// fields are expected to be similar-length restatements, not longer than
// answer, so a moderate bump covers the added content without materially
// inflating cost/latency (see context/specs/09-plain-language-pidgin-toggles.md
// Decision 13).
const MAX_COMPLETION_TOKENS = 3072

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name} (check .env.local)`)
  }
  return value
}

const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })

// Confirmed by reading the installed `openai` package's source directly
// (node_modules/openai/lib/parser.js, node_modules/openai/helpers/zod.js):
// chat.completions.parse() throws a raw ZodError (schema mismatch) or
// SyntaxError (invalid JSON) — NOT wrapped in an OpenAIError subclass,
// unlike Anthropic's equivalent, which wraps everything in AnthropicError.
// It also throws LengthFinishReasonError / ContentFilterFinishReasonError
// for truncated/filtered output (these DO extend OpenAIError). Given this
// mixed taxonomy, a narrow `instanceof OpenAI.OpenAIError` catch would miss
// a genuine malformed-JSON/schema-mismatch case — so the catch below is
// deliberately broad (any thrown error is treated as "malformed, retry"),
// not narrowed to a specific error class.
async function requestStructuredAnswer(query: string, chunks: RetrievedChunk[]): Promise<ChatResponse | null> {
  let completion
  try {
    completion = await openai.chat.completions.parse({
      model: MODEL,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: "low", // straightforward RAG QA, not a hard reasoning task
      messages: buildMessages(query, chunks),
      response_format: zodResponseFormat(ModelOutputSchema, "model_output"),
    })
  } catch (error) {
    console.error("OpenAI structured generation failed:", error)
    return null
  }

  const choice = completion.choices[0]
  if (!choice || choice.message.refusal) {
    return null
  }

  const parsed = choice.message.parsed
  if (!parsed) {
    return null
  }

  const chunkById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]))
  const citedIds = [...new Set(parsed.cited_chunk_ids)] // de-dupe defensively
  const citationsValid = citedIds.every((id) => chunkById.has(id))
  const groundingConsistent = parsed.grounded ? citedIds.length > 0 : citedIds.length === 0

  if (!citationsValid || !groundingConsistent) {
    return null
  }

  // Citation metadata is reconstructed from the already-trustworthy
  // RetrievedChunk data, never taken from the model's own output — see
  // lib/ai/schema.ts's ModelOutputSchema comment for why.
  const citations: Citation[] = citedIds.map((id) => {
    const chunk = chunkById.get(id)!
    return {
      chunk_id: chunk.chunkId,
      source_title: chunk.sourceTitle,
      source_name: chunk.sourceName,
      source_url: chunk.sourceUrl,
    }
  })

  // simple_version/pidgin_version are read straight from the model's own
  // output, unlike citations — they're plain restated text, not metadata
  // that needs reconstructing from a more-trustworthy source. Faithfulness
  // is enforced at the prompt level (lib/ai/prompts.ts), not re-validated
  // here — see context/specs/09-plain-language-pidgin-toggles.md Decision 6.
  return {
    escalated: false,
    // Spec 17: ChatResponseSchema gained this field so the client can
    // distinguish a grounded answer from ClarificationResponseSchema — this
    // path (real generation) never asks a clarifying question itself, that's
    // the classifier's job (lib/ai/classify.ts), so it's always false here.
    needs_clarification: false,
    // 2026-08-28: same reasoning again, distinguishing from
    // ServiceNavigationResponseSchema — this path never does navigation
    // lookups, that's app/api/chat/route.ts's job.
    service_navigation: false,
    // Spec 25: same reasoning again, distinguishing from
    // ConversationalResponseSchema — this path never dispatches a
    // conversational reply, that's app/api/chat/route.ts's job.
    conversational: false,
    grounded: parsed.grounded,
    answer: parsed.answer,
    citations,
    simple_version: parsed.simple_version,
    pidgin_version: parsed.pidgin_version,
  }
}

export async function generateAnswer(query: string, chunks: RetrievedChunk[]): Promise<ChatResponse | null> {
  const first = await requestStructuredAnswer(query, chunks)
  if (first) return first

  // One retry, per code-standards.md ("A malformed response is retried
  // once, then falls back to a safe canned response").
  return requestStructuredAnswer(query, chunks)
}
