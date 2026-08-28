/**
 * lib/preparation/lookup.ts — the only preparation_checklists query in the
 * codebase (architecture.md's file-organisation pattern: lib/kb/ and
 * lib/directory/ are each the sole owner of their table; this is the same
 * boundary for preparation_checklists — context/specs/20-capability-router-and-navigation.md).
 *
 * Deterministic, exact `service` lookup — never a similarity/vector search
 * (Part 13 of the 2026-08-28 task: healthcare_preparation must not depend
 * entirely on vector RAG). Returns null on no match; the caller
 * (app/api/chat/route.ts) falls back to the existing RAG path rather than
 * treating that as an error.
 */

import { supabase } from "@/lib/supabase/client"
import type { PreparationService } from "@/lib/ai/schema"

export interface PreparationChecklist {
  service: string
  title: string
  preparationItems: string[]
  variabilityNote: string
  clinicalReviewStatus: string
}

interface PreparationChecklistRow {
  service: string
  title: string
  preparation_items: string[]
  variability_note: string
  clinical_review_status: string
}

export async function findPreparationChecklist(service: PreparationService): Promise<PreparationChecklist | null> {
  const { data, error } = await supabase
    .from("preparation_checklists")
    .select("service, title, preparation_items, variability_note, clinical_review_status")
    .eq("service", service)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed fetching preparation_checklists for service "${service}": ${error.message}`)
  }
  if (!data) {
    return null
  }

  const row = data as PreparationChecklistRow
  return {
    service: row.service,
    title: row.title,
    preparationItems: row.preparation_items,
    variabilityNote: row.variability_note,
    clinicalReviewStatus: row.clinical_review_status,
  }
}

// Renders a checklist as a single plain-text passage, in the same shape
// lib/ai/prompts.ts's formatContext() expects for a KB chunk's `content` —
// this lets app/api/chat/route.ts feed it into the existing, unmodified
// generateAnswer() pipeline as one synthetic chunk (see that file's comment
// for why: it reuses the already-proven faithfulness/citation/simple-pidgin
// generation contract instead of inventing a second one, while guaranteeing
// the model has nothing else to draw from).
export function formatChecklistAsChunkContent(checklist: PreparationChecklist): string {
  const items = checklist.preparationItems.map((item) => `- ${item}`).join("\n")
  return `${checklist.title}\n\n${items}\n\nNote: ${checklist.variabilityNote}`
}
