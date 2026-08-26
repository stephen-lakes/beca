/**
 * lib/ai/schema.ts — the shared structured-output schema for chat generation.
 *
 * Base schema only (Spec 05). No escalation fields (Spec 06 extends this),
 * no simple_version/pidgin_version fields (Spec 09 extends this).
 */

import { z } from "zod"

export const CitationSchema = z.object({
  chunk_id: z.string(),
  source_title: z.string(),
  source_name: z.string(),
  source_url: z.string().nullable(),
})
export type Citation = z.infer<typeof CitationSchema>

export const ChatResponseSchema = z.object({
  // false when the provided context doesn't adequately answer the specific
  // question — distinct from the deterministic zero-retrieval short-circuit
  // in lib/kb/search.ts (see context/specs/05-rag-chat-api.md Decision 3).
  grounded: z.boolean(),
  answer: z.string().min(1),
  // Must be empty when grounded is false, non-empty when grounded is true —
  // enforced in lib/ai/client.ts (schema-level zod can't express this
  // cross-field rule inside the structured-output JSON Schema without
  // complicating what the model has to satisfy, so it's checked as a
  // second pass).
  citations: z.array(CitationSchema),
})
export type ChatResponse = z.infer<typeof ChatResponseSchema>

// What the model itself is asked to produce — NOT the same as
// ChatResponseSchema. The model only reports which retrieved chunks it
// used; it never invents source_title/source_name/source_url, because
// nothing then cross-checks those fields against the real chunk (unlike
// chunk_id, which lib/ai/client.ts does validate). A real live test
// surfaced this: the model correctly cited a real chunk_id but returned
// source_url: null for a source that has a real URL, because prompts.ts
// never even gave it the URL — it was guessing at metadata it had no way
// to know. lib/ai/client.ts reconstructs the full Citation objects
// server-side from the already-trustworthy RetrievedChunk data instead.
export const ModelOutputSchema = z.object({
  grounded: z.boolean(),
  answer: z.string().min(1),
  cited_chunk_ids: z.array(z.string()),
})
export type ModelOutput = z.infer<typeof ModelOutputSchema>

// Fixed copy for the two distinct "nothing useful to show" states
// (context/specs/05-rag-chat-api.md Decision 6 / app-flow.md states 4 and 5).
export const NO_GROUNDED_INFO_MESSAGE =
  "I don't have approved-source information on that topic yet. Please ask about vaccines, common illnesses, nutrition, hygiene, family planning, mental health, or preparing for a clinic visit — or see a health worker for anything specific to your situation."

export const GENERATION_FAILURE_MESSAGE = "Something went wrong generating an answer. Please try again."
