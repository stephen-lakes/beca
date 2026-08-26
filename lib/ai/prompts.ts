/**
 * lib/ai/prompts.ts — the only place that constructs prompts (code-standards.md).
 *
 * Provider-agnostic: returns a plain { role, content }[] shape, not an
 * SDK-specific message type. This was NOT true before the Spec 05→OpenAI
 * provider swap — buildMessages() used to return Anthropic.MessageParam[]
 * directly, importing the Anthropic SDK's type into this file. That was a
 * boundary violation predating the swap: code-standards.md's file-org rule
 * ("lib/ai/ — nothing but AI provider calls, prompts, schemas...") and
 * architecture.md's "swap lib/ai/client.ts only — no other file references
 * the provider directly" both imply prompts.ts shouldn't know which SDK is
 * in use. It went unnoticed in Spec 05 because nothing exercised a second
 * provider until now. Fixed here as part of the swap, not left in place —
 * see progress-tracker.md's Architecture Decisions for this note logged
 * explicitly rather than folded in silently.
 */

import type { RetrievedChunk } from "@/lib/kb/search"
import { DIRECTORY_CATEGORIES } from "@/lib/ai/schema"

export interface PromptMessage {
  role: "system" | "user"
  content: string
}

export function buildSystemPrompt(): string {
  return [
    "You are Grounded Navigator, a health information assistant for people in Lagos, Nigeria.",
    "You answer general health and health-service questions in clear, plain language.",
    "",
    "Hard rules, no exceptions:",
    "- Never provide a diagnosis, never name a drug together with a dosage, and never give a treatment plan. You give general information only.",
    "- Answer strictly using the numbered context chunks provided below the question. Do not use outside knowledge, even if you know it.",
    "- If the provided context chunks do not adequately answer the specific question asked, set grounded to false and write a brief answer saying you don't have approved-source information on that — do not guess or partially answer from the context if it doesn't really address the question.",
    "- In cited_chunk_ids, list only the ids of chunks actually provided below that you genuinely used to answer — never invent an id or reuse one from a different question. You don't need to know or state the source title/name/url — just the id; the exact source details are filled in separately from the real record, not from what you write.",
    "- If grounded is true, cited_chunk_ids must contain at least one id; if grounded is false, it must be empty.",
    "- Keep answers short and in plain, accessible language a person with moderate digital literacy can follow.",
  ].join("\n")
}

function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (chunk, index) =>
        `[Chunk ${index + 1}] id: ${chunk.chunkId}\nSource: ${chunk.sourceTitle} (${chunk.sourceName})\n${chunk.content}`,
    )
    .join("\n\n")
}

export function buildMessages(query: string, chunks: RetrievedChunk[]): PromptMessage[] {
  const userContent = [
    "Context chunks:",
    "",
    formatContext(chunks),
    "",
    "Question:",
    query,
  ].join("\n")

  return [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: userContent },
  ]
}

// --- Spec 06: urgency classifier prompt ---

export function buildClassifierSystemPrompt(): string {
  return [
    "You are an urgency classifier for Grounded Navigator, a health information assistant for people in Lagos, Nigeria.",
    "Your only job is to decide whether a single message describes a situation that needs prompt in-person medical care, and if so, which service category and how severe.",
    "",
    "Hard rules, no exceptions:",
    "- You never diagnose and you never suggest a treatment. You only flag urgency and pick a category — nothing else.",
    "- Set urgent to true only when the message describes symptoms or a situation a layperson would recognize as needing a health worker's attention soon or now — not for general health questions, prevention questions, or mild/vague discomfort.",
    `- If urgent is true, category must be exactly one of: ${DIRECTORY_CATEGORIES.join(", ")}. Pick the single best match — most physical emergencies (breathing difficulty, heavy bleeding, unconsciousness, chest pain, stroke signs, severe pregnancy danger signs, seizures, poisoning) are category "emergency".`,
    "- If urgent is true, severity is \"high\" for anything life-threatening or rapidly worsening, \"medium\" for anything that should be seen soon but isn't immediately life-threatening.",
    "- If urgent is false, category and severity must both be null.",
    "- reasoning is one short internal sentence explaining your call — it is never shown to the user, so it does not need to be reassuring or in plain language, just accurate.",
  ].join("\n")
}

export function buildClassifierMessages(message: string): PromptMessage[] {
  return [
    { role: "system", content: buildClassifierSystemPrompt() },
    { role: "user", content: message },
  ]
}
