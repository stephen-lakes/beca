/**
 * scripts/seed-directory.ts — Spec 04: Directory seed load
 *
 * One-off, dev-time script. Loads:
 *   - data/clinic_directory.json      → directory_entries
 *   - data/red_flag_rules.json        → red_flag_rules
 *
 * data/red_flag_rules.json was drafted for review (see
 * context/specs/04-directory-seed-load.md Status), reviewed, and approved
 * for loading with its two flagged judgment calls (severe pregnancy danger
 * signs → 'emergency'; imminent self-harm risk → 'mental-health', flagged
 * for different escalation handling in Spec 06) accepted as drafted — see
 * progress-tracker.md's Architecture Decisions.
 *
 * Usage: npm run seed-directory
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

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

// ---------------------------------------------------------------------------
// data/clinic_directory.json — validated shape (code-standards.md: validate
// all external input with zod). Note this is the JSON's raw shape, not the
// directory_entries DB shape — `verified` here is boolean | "name-only" |
// "n/a", not yet the DB's text enum. Mapped below.
// ---------------------------------------------------------------------------

const ClinicDirectoryEntrySchema = z.object({
  id: z.number(),
  category: z.string().min(1),
  name: z.string().min(1),
  area: z.string().min(1),
  contact: z.string().min(1),
  verified: z.union([z.boolean(), z.literal("name-only"), z.literal("n/a")]),
})
type ClinicDirectoryEntry = z.infer<typeof ClinicDirectoryEntrySchema>

const ClinicDirectoryFileSchema = z.array(ClinicDirectoryEntrySchema)

// The seed file's entry #12 ("Directory scope note") is a pitch/scope
// disclaimer, not a real clinic/service entry — see
// context/specs/04-directory-seed-load.md Scope section. Excluded from the
// load, identified by its category rather than its id so a re-ordering of
// the source file wouldn't silently change what gets excluded.
const EXCLUDED_CATEGORY = "disclaimer"

// Maps the JSON's mixed verified shape to directory_entries.verified's text
// enum ('true' / 'false' / 'name-only' — database-schema.md).
function mapVerified(raw: ClinicDirectoryEntry["verified"]): "true" | "false" | "name-only" {
  if (raw === true) return "true"
  if (raw === false) return "false"
  if (raw === "name-only") return "name-only"
  throw new Error(`Unexpected verified value: ${JSON.stringify(raw)} — no DB mapping defined for it`)
}

// ---------------------------------------------------------------------------
// data/red_flag_rules.json — validated shape. `id`, `taxonomy_category`, and
// `notes` are review/traceability metadata only — not columns on
// red_flag_rules (database-schema.md: pattern, category, severity) — same
// convention as kb_topics.json's `notes` field in ingest-kb.ts.
// ---------------------------------------------------------------------------

const RedFlagRuleSchema = z.object({
  id: z.number(),
  taxonomy_category: z.string().min(1),
  pattern: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(["high", "medium"]),
  notes: z.string().optional().default(""),
})
type RedFlagRule = z.infer<typeof RedFlagRuleSchema>

const RedFlagRulesFileSchema = z.array(RedFlagRuleSchema)

// ---------------------------------------------------------------------------
// Store — self-contained Supabase client, same pattern as ingest-kb.ts
// (lib/supabase/ doesn't exist yet; reserved for the running app's
// server-only client, built later)
// ---------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function clearExistingDirectoryEntries(): Promise<void> {
  // Re-runnable by design: one-shot dev-time tool, not idempotent-by-upsert
  // application code (same convention as ingest-kb.ts).
  const { error } = await supabase.from("directory_entries").delete().not("id", "is", null)
  if (error) {
    throw new Error(`Failed clearing existing directory_entries: ${error.message}`)
  }
}

async function insertDirectoryEntries(entries: ClinicDirectoryEntry[]): Promise<void> {
  const rows = entries.map((entry) => ({
    category: entry.category,
    name: entry.name,
    area: entry.area,
    contact: entry.contact,
    verified: mapVerified(entry.verified),
  }))

  const { error } = await supabase.from("directory_entries").insert(rows)
  if (error) {
    throw new Error(`Failed inserting directory_entries: ${error.message}`)
  }
}

async function clearExistingRedFlagRules(): Promise<void> {
  const { error } = await supabase.from("red_flag_rules").delete().not("id", "is", null)
  if (error) {
    throw new Error(`Failed clearing existing red_flag_rules: ${error.message}`)
  }
}

async function insertRedFlagRules(rules: RedFlagRule[]): Promise<void> {
  const rows = rules.map((rule) => ({
    pattern: rule.pattern,
    category: rule.category,
    severity: rule.severity,
  }))

  const { error } = await supabase.from("red_flag_rules").insert(rows)
  if (error) {
    throw new Error(`Failed inserting red_flag_rules: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function seedDirectoryEntries(): Promise<void> {
  const rawEntries = JSON.parse(readFileSync(path.join(process.cwd(), "data/clinic_directory.json"), "utf-8"))
  const allEntries = ClinicDirectoryFileSchema.parse(rawEntries)

  const entries = allEntries.filter((entry) => entry.category !== EXCLUDED_CATEGORY)
  const excludedCount = allEntries.length - entries.length

  console.log(`Loaded ${allEntries.length} entries from data/clinic_directory.json`)
  console.log(`Excluding ${excludedCount} non-clinic entry/entries (category === "${EXCLUDED_CATEGORY}")`)
  console.log(`${entries.length} entries will be inserted into directory_entries`)

  console.log("Clearing existing directory_entries rows...")
  await clearExistingDirectoryEntries()

  console.log("Inserting...")
  await insertDirectoryEntries(entries)

  console.log(`Done. ${entries.length} rows inserted into directory_entries.`)
}

async function seedRedFlagRules(): Promise<void> {
  const rawRules = JSON.parse(readFileSync(path.join(process.cwd(), "data/red_flag_rules.json"), "utf-8"))
  const rules = RedFlagRulesFileSchema.parse(rawRules)

  console.log(`Loaded ${rules.length} rules from data/red_flag_rules.json`)
  console.log("Clearing existing red_flag_rules rows...")
  await clearExistingRedFlagRules()

  console.log("Inserting...")
  await insertRedFlagRules(rules)

  console.log(`Done. ${rules.length} rows inserted into red_flag_rules.`)
}

async function main(): Promise<void> {
  console.log("--- directory_entries ---")
  await seedDirectoryEntries()

  console.log("")
  console.log("--- red_flag_rules ---")
  await seedRedFlagRules()
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exitCode = 1
})
