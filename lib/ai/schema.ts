/**
 * lib/ai/schema.ts — the shared structured-output schema for chat generation
 * and, since Spec 06, urgency classification and escalation responses.
 *
 * Since Spec 09: every ChatResponse also carries simple_version/
 * pidgin_version — faithful restatements of `answer` in a further-reduced
 * reading level and in Nigerian Pidgin, generated in the same completion
 * (or, on the deterministic zero-retrieval path, sourced from fixed
 * constants — see NO_GROUNDED_INFO_MESSAGE_SIMPLE/_PIDGIN below). Never
 * added to EscalationResponseSchema — see
 * context/specs/09-plain-language-pidgin-toggles.md Decision 1.
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
  // Spec 17: always false on this path — distinguishes this shape from
  // ClarificationResponseSchema below the same way `escalated` distinguishes
  // it from EscalationResponseSchema. The client checks `escalated` first,
  // then `needs_clarification`, rather than switching every shape to one
  // unified `type` discriminant — see
  // context/specs/17-triage-clarification-classifier.md Decision 3.
  needs_clarification: z.literal(false),
  // 2026-08-28: always false on this path — distinguishes this shape from
  // ServiceNavigationResponseSchema below the same way `needs_clarification`
  // distinguishes it from ClarificationResponseSchema. See
  // context/specs/20-capability-router-and-navigation.md.
  service_navigation: z.literal(false),
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
  // Spec 09: always populated, never optional — either model-generated
  // alongside `answer` (lib/ai/client.ts) or, on the deterministic
  // zero-retrieval path, the fixed NO_GROUNDED_INFO_MESSAGE_SIMPLE/_PIDGIN
  // constants below (app/api/chat/route.ts).
  simple_version: z.string().min(1),
  pidgin_version: z.string().min(1),
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
  // Spec 09: requested unconditionally, whether grounded is true or false —
  // the model always produces an `answer`, so it always produces its two
  // restatements alongside it. Faithfulness (no new claim/diagnosis/dosage
  // not already in `answer`) is a prompt-level rule (lib/ai/prompts.ts), not
  // re-validated here — see context/specs/09-plain-language-pidgin-toggles.md
  // Decision 6.
  simple_version: z.string().min(1),
  pidgin_version: z.string().min(1),
})
export type ModelOutput = z.infer<typeof ModelOutputSchema>

// Fixed copy for the two distinct "nothing useful to show" states
// (context/specs/05-rag-chat-api.md Decision 6 / app-flow.md states 4 and 5).
export const NO_GROUNDED_INFO_MESSAGE =
  "I don't have approved-source information on that topic yet. Please ask about vaccines, common illnesses, nutrition, hygiene, family planning, mental health, or preparing for a clinic visit — or see a health worker for anything specific to your situation."

// Spec 09: fixed Simple/Pidgin companions to NO_GROUNDED_INFO_MESSAGE, for
// the deterministic zero-retrieval path in app/api/chat/route.ts, which
// never calls the model and so can't ask it for these. Claude-drafted, not
// yet reviewed by a fluent Pidgin speaker — flagged as an Open Question in
// context/specs/09-plain-language-pidgin-toggles.md, not blocking since this
// is non-clinical refusal copy, not a safety categorization.
export const NO_GROUNDED_INFO_MESSAGE_SIMPLE =
  "I don't know enough about that yet from a trusted source. You can ask me about things like vaccines, common sickness, food and nutrition, staying clean, family planning, mental health, or getting ready for a clinic visit. For anything about your own health, please see a health worker."

export const NO_GROUNDED_INFO_MESSAGE_PIDGIN =
  "I no get correct information for that one yet. You fit ask me about vaccine, common sickness, food and nutrition, cleanliness, family planning, mental health, or how to prepare for clinic visit. If na your own case, abeg go see health worker."

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
// afterward) — cross-field null-consistency is still checked in
// lib/ai/classify.ts, the same way ChatResponseSchema's grounded/citations
// consistency is checked in lib/ai/client.ts, since zod can't express that
// rule inside the structured-output JSON Schema itself.
//
// Spec 17: `urgent: boolean` became a 3-way `outcome` — see
// context/specs/17-triage-clarification-classifier.md Decision 2. Consistency
// rule enforced in lib/ai/classify.ts: "not_urgent" → category/severity/
// clarifying_questions all null; "urgent" → category/severity non-null,
// clarifying_questions null; "needs_clarification" → category/severity are a
// required best guess (not left null) *and* clarifying_questions is
// non-null — the best guess exists specifically so app/api/chat/route.ts
// always has real values to build an escalation from if the one-round cap
// (Decision 4) forces an override rather than a second question.
export const UrgencyOutcomeSchema = z.enum(["not_urgent", "urgent", "needs_clarification"])
export type UrgencyOutcome = z.infer<typeof UrgencyOutcomeSchema>

export const UrgencyClassificationSchema = z.object({
  outcome: UrgencyOutcomeSchema,
  category: DirectoryCategorySchema.nullable(),
  severity: z.enum(["high", "medium"]).nullable(),
  // 1–2 items, only when outcome is "needs_clarification" — null otherwise.
  clarifying_questions: z.array(z.string().min(1)).min(1).max(2).nullable(),
  reasoning: z.string(),
})
export type UrgencyClassification = z.infer<typeof UrgencyClassificationSchema>

export const EscalationResponseSchema = z.object({
  escalated: z.literal(true),
  // Spec 17: mutually exclusive with `escalated: true` by construction —
  // included for the same uniform-shape reason as ChatResponseSchema's
  // `needs_clarification: false` above, not because a caller needs to check
  // both fields to know which response this is.
  needs_clarification: z.literal(false),
  // 2026-08-28: same reasoning again for service_navigation — see
  // ChatResponseSchema's comment above.
  service_navigation: z.literal(false),
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

// --- 2026-08-28: capability router + healthcare preparation + service
// navigation (context/specs/20-capability-router-and-navigation.md) ---
//
// This section is additive to everything above. Nothing in Specs 05/06/17
// was changed to make room for it: the capability classifier below only
// ever runs on a message that has already fallen through the existing
// safety branch in app/api/chat/route.ts (not urgent, not needs
// clarification) — see that file's own comment at the call site for why.

// Part 3's minimum list, with one deliberate omission explained in
// route.ts: "emergency" IS included here (the capability classifier can
// still name it — a second, independent signal is a safety net, not a
// replacement for the real one), but it is never the *sole* trigger for
// escalation copy — see the route's handling.
export const CAPABILITIES = [
  "health_education",
  "preventive_health",
  "healthcare_preparation",
  "service_navigation",
  "disease_information",
  "when_to_seek_care",
  "medication_safety",
  "emergency",
  "out_of_scope",
] as const
export const CapabilitySchema = z.enum(CAPABILITIES)
export type Capability = z.infer<typeof CapabilitySchema>

// Part 3: capabilities that reuse the existing, unmodified RAG pipeline
// (searchKb + generateAnswer) — no dedicated dispatch branch of their own.
// preventive_health is a real, distinct label at the routing/classification
// level (what Part 2 actually asks for), even though today it shares
// retrieval mechanics with health_education — see the audit's Part J for why
// this is an honest, deliberate scoping choice, not a shortcut hidden from
// the docs.
export const RAG_CAPABILITIES = [
  "health_education",
  "preventive_health",
  "disease_information",
  "when_to_seek_care",
  "medication_safety",
  "out_of_scope",
] as const satisfies readonly Capability[]

// Part 13's service list — used only by the deterministic healthcare_preparation
// lookup (lib/preparation/lookup.ts), never by the LLM to invent guidance.
export const PREPARATION_SERVICES = [
  "general_clinic_visit",
  "antenatal_care",
  "postnatal_care",
  "child_immunization",
  "adult_vaccination",
  "laboratory_testing",
  "imaging",
  "dental_visit",
  "chronic_disease_follow_up",
  "specialist_consultation",
] as const
export const PreparationServiceSchema = z.enum(PREPARATION_SERVICES)
export type PreparationService = z.infer<typeof PreparationServiceSchema>

// Part 11's service list — used only to filter directory_entries.services
// (lib/directory/lookup.ts's findByService), never invented by the model.
export const NAVIGATION_SERVICES = [
  "vaccination",
  "antenatal_care",
  "postnatal_care",
  "delivery",
  "paediatrics",
  "laboratory",
  "emergency",
  "family_planning",
  "hiv_services",
  "malaria_services",
  "general_outpatient",
  "dental",
  "imaging",
  "mental_health",
  // Added 2026-08-28 for the MedServe-LUTH Cancer Centre (MLCC) directory
  // entry — Part 11 of context/specs/20-capability-router-and-navigation.md
  // explicitly says to design this list to be expanded later; not one of
  // that spec's original example values, added on real demand instead of
  // speculatively.
  "oncology",
] as const
export const NavigationServiceSchema = z.enum(NAVIGATION_SERVICES)
export type NavigationService = z.infer<typeof NavigationServiceSchema>

export const RiskLevelSchema = z.enum(["low", "medium", "high"])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

// What the capability classifier itself is asked to produce. topic/
// question_type are free-form short labels (informational/observability
// only — never used to bypass retrieval or fabricate an answer; the actual
// evidence still comes from searchKb/generateAnswer or the structured
// lookups). preparation_service/navigation_service/location are populated
// only when relevant to the chosen capability — consistency enforced in
// lib/ai/classify-capability.ts, the same way UrgencyClassificationSchema's
// cross-field rule is enforced in lib/ai/classify.ts (zod can't express it
// inside the structured-output JSON Schema itself).
export const CapabilityClassificationSchema = z.object({
  capability: CapabilitySchema,
  topic: z.string().nullable(),
  question_type: z.string().nullable(),
  risk_level: RiskLevelSchema,
  preparation_service: PreparationServiceSchema.nullable(),
  navigation_service: NavigationServiceSchema.nullable(),
  location: z.string().nullable(),
  reasoning: z.string(),
})
export type CapabilityClassification = z.infer<typeof CapabilityClassificationSchema>

// The fourth possible /api/chat response shape (alongside ChatResponseSchema,
// EscalationResponseSchema, ClarificationResponseSchema above) — Part 2
// Capability 4: "the LLM should only format/explain results returned by the
// database." This response is built entirely from findByService()'s
// deterministic query result; no LLM call is made for it at all, so there is
// no generation step that could invent a facility. escalated/
// needs_clarification stay false so the client's existing "check escalated
// first, then needs_clarification" branch still works unmodified — this
// shape is distinguished by service_navigation alone, the same pattern
// Spec 17/18 used for needs_clarification.
export const ServiceNavigationResponseSchema = z.object({
  escalated: z.literal(false),
  needs_clarification: z.literal(false),
  service_navigation: z.literal(true),
  service: NavigationServiceSchema,
  message: z.string(),
  matched_entries: z.array(DirectoryEntrySchema),
})
export type ServiceNavigationResponse = z.infer<typeof ServiceNavigationResponseSchema>

// --- Spec 17: multi-turn triage clarification ---
// context/specs/17-triage-clarification-classifier.md

// The third possible /api/chat response shape, alongside ChatResponseSchema
// and EscalationResponseSchema above. `escalated: false` is included so the
// client's existing "check escalated first" branch still works unmodified —
// this shape is distinguished from ChatResponseSchema by `needs_clarification`
// alone, the same way EscalationResponseSchema is distinguished by
// `escalated` alone (Decision 3).
export const ClarificationResponseSchema = z.object({
  escalated: z.literal(false),
  needs_clarification: z.literal(true),
  // 2026-08-28: same reasoning again — see ChatResponseSchema's comment
  // above.
  service_navigation: z.literal(false),
  questions: z.array(z.string().min(1)).min(1).max(2),
})
export type ClarificationResponse = z.infer<typeof ClarificationResponseSchema>

// The request body's optional field carrying clarification context back to
// the server (Decision 1). The server is still fully stateless — nothing is
// persisted here, this is only ever read from the incoming request, never
// written anywhere. Supplied by the client only on the one turn immediately
// following a Clarification-state render, sourced from what the client
// already displayed (the original message + the questions it rendered).
export const PriorClarificationSchema = z.object({
  originalMessage: z.string().min(1).max(2000),
  questionsAsked: z.array(z.string().min(1)).min(1).max(2),
})
export type PriorClarification = z.infer<typeof PriorClarificationSchema>

// --- Spec 23: conversation context resolution ---
// context/specs/23-conversation-context-resolution.md

// The request body's optional field carrying a bounded window of the
// thread's own recent turns back to the server (Decision 2). Same
// stateless-server contract PriorClarificationSchema above already
// established: nothing here is ever persisted, only read from the incoming
// request. Assistant turns are flattened to plain text by the client
// (Spec 24) regardless of which of the four response shapes produced them —
// this module doesn't care which shape a turn came from, only its text.
export const ConversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
})
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>

// What the context-resolution classifier itself is asked to produce.
// needs_resolution gates whether resolved_query is ever used — see
// lib/ai/resolve-context.ts's Decision 3 substitution rule: a
// self-contained message's own resolved_query is always discarded, never
// trusted even though presumably near-identical — the same "don't let the
// model touch what doesn't need touching" reasoning Spec 19 Decision 3
// applied to retrieval query expansion.
export const ResolvedContextSchema = z.object({
  needs_resolution: z.boolean(),
  resolved_query: z.string().min(1),
  reasoning: z.string(),
})
export type ResolvedContext = z.infer<typeof ResolvedContextSchema>
