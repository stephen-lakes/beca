/**
 * lib/ai/schema.ts — the shared structured-output schema for chat generation
 * and, since Spec 06, urgency classification and escalation responses.
 *
 * No simple_version/pidgin_version fields yet (Spec 09 extends this).
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
  // Always false on this path — distinguishes the grounded-answer shape
  // from EscalationResponseSchema below without the client needing to know
  // which shape it's holding first (Spec 06 Decision, see
  // context/specs/06-urgency-classifier-escalation.md).
  escalated: z.literal(false),
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

// --- Spec 06: urgency classification + escalation ---

// The 8 real directory_entries categories a message can be routed to.
// Excludes 'disclaimer' — that row is a scope note, never a routing target
// (data/clinic_directory.json entry #12). Single source of truth, shared by
// the AI classifier's output schema and lib/directory/lookup.ts (which
// imports this rather than the other way around — see
// context/specs/06-urgency-classifier-escalation.md Decision 12).
export const DIRECTORY_CATEGORIES = [
  "emergency",
  "general-tertiary",
  "primary-care",
  "maternal-care",
  "child-health",
  "mental-health",
  "family-planning",
  "malaria-treatment",
  "general",
] as const
export const DirectoryCategorySchema = z.enum(DIRECTORY_CATEGORIES)
export type DirectoryCategory = z.infer<typeof DirectoryCategorySchema>

export const DirectoryEntrySchema = z.object({
  category: z.string(),
  name: z.string(),
  area: z.string().nullable(),
  contact: z.string().nullable(),
  verified: z.enum(["true", "false", "name-only"]),
})
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>

// What the AI classifier itself is asked to produce. category/severity are
// judgments the model makes directly (unlike ChatResponseSchema's citation
// metadata, nothing here is reconstructed from a more-trustworthy source
// afterward) — cross-field null-consistency (urgent implies non-null
// category/severity, and vice versa) is still checked in lib/ai/classify.ts,
// the same way ChatResponseSchema's grounded/citations consistency is
// checked in lib/ai/client.ts, since zod can't express that rule inside the
// structured-output JSON Schema itself.
export const UrgencyClassificationSchema = z.object({
  urgent: z.boolean(),
  category: DirectoryCategorySchema.nullable(),
  severity: z.enum(["high", "medium"]).nullable(),
  reasoning: z.string(),
})
export type UrgencyClassification = z.infer<typeof UrgencyClassificationSchema>

export const EscalationResponseSchema = z.object({
  escalated: z.literal(true),
  category: z.string(),
  severity: z.enum(["high", "medium"]),
  message: z.string(),
  matched_entries: z.array(DirectoryEntrySchema),
})
export type EscalationResponse = z.infer<typeof EscalationResponseSchema>

// Fixed, severity-keyed escalation copy — never LLM-generated. See
// context/specs/06-urgency-classifier-escalation.md Decision 5.
export const HIGH_SEVERITY_MESSAGE = "This could be serious. Please seek care now — see the contact(s) below."
export const MEDIUM_SEVERITY_MESSAGE = "This should be checked by a health worker soon. See the contact(s) below."
