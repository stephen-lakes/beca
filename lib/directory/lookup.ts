/**
 * lib/directory/lookup.ts — the only red_flag_rules / directory_entries
 * queries in the codebase (architecture.md: "lib/kb/ and lib/directory/ are
 * the only modules that query Supabase"). Covers both the deterministic
 * red-flag keyword check and the escalation directory-entry lookup — both
 * serve the same escalation domain; see
 * context/specs/06-urgency-classifier-escalation.md Decision 11 for why
 * they live in one file rather than lib/ai/.
 */

import { supabase } from "@/lib/supabase/client"
import type { DirectoryEntry } from "@/lib/ai/schema"

interface RedFlagRuleRow {
  pattern: string
  category: string
  severity: "high" | "medium"
}

export interface RedFlagMatch {
  category: string
  severity: "high" | "medium"
}

// Case-insensitive substring match against red_flag_rules.pattern.
// Intentionally literal, not fuzzy — see Decision 3: this layer is a fast,
// high-precision safety net for near-identical phrasing; the AI classifier
// is the layer that interprets paraphrased descriptions. First match wins,
// in id-ascending (table) order.
export async function checkRedFlagKeywords(message: string): Promise<RedFlagMatch | null> {
  const { data, error } = await supabase
    .from("red_flag_rules")
    .select("pattern, category, severity")
    .order("id", { ascending: true })

  if (error) {
    throw new Error(`Failed fetching red_flag_rules: ${error.message}`)
  }

  const rows = (data ?? []) as RedFlagRuleRow[]
  const lowerMessage = message.toLowerCase()
  const match = rows.find((row) => lowerMessage.includes(row.pattern.toLowerCase()))

  return match ? { category: match.category, severity: match.severity } : null
}

// Returns every directory_entries row for the category — an array, not a
// single nullable entry (Decision 9), since 'emergency' has two live rows
// (Lagos ambulance/emergency service + the national number) and both are
// relevant. Excludes the 'disclaimer' scope-note row defensively, even
// though no valid category value should ever equal it (DIRECTORY_CATEGORIES
// omits it, and Spec 04 confirmed red_flag_rules.category never uses it).
export async function findDirectoryEntry(category: string): Promise<DirectoryEntry[]> {
  const { data, error } = await supabase
    .from("directory_entries")
    .select("category, name, area, contact, verified")
    .eq("category", category)
    .neq("category", "disclaimer")

  if (error) {
    throw new Error(`Failed fetching directory_entries for category "${category}": ${error.message}`)
  }

  return (data ?? []) as DirectoryEntry[]
}

// 2026-08-28: service_navigation's lookup (context/specs/20-capability-router-and-navigation.md)
// — additive to findDirectoryEntry above, not a replacement. Filters by the
// new directory_entries.services array column (supabase/migrations/0003_capabilities.sql)
// rather than the escalation `category` column, so a calm "where can I get
// antenatal care" query can reach the same real directory without being
// routed through escalation-category naming. Part 2 Capability 4 / Part 18:
// this is the ONLY source of facility information for service_navigation —
// the LLM never touches this table's absence or presence of a match, it's
// used to build a fully deterministic response in app/api/chat/route.ts.
export async function findByService(service: string): Promise<DirectoryEntry[]> {
  const { data, error } = await supabase
    .from("directory_entries")
    .select("category, name, area, contact, verified")
    .contains("services", [service])
    .neq("category", "disclaimer")

  if (error) {
    throw new Error(`Failed fetching directory_entries for service "${service}": ${error.message}`)
  }

  return (data ?? []) as DirectoryEntry[]
}
