/**
 * scripts/seed-preparation.ts — healthcare_preparation structured checklists
 * (context/specs/20-capability-router-and-navigation.md).
 *
 * One-off, dev-time script. Loads data/preparation_checklists.json into
 * preparation_checklists (supabase/migrations/0003_capabilities.sql) —
 * same pattern scripts/seed-directory.ts already established for
 * data/clinic_directory.json.
 *
 * Usage: npm run seed-preparation
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { PreparationServiceSchema } from "@/lib/ai/schema"

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

const PreparationChecklistSchema = z.object({
  service: PreparationServiceSchema,
  title: z.string().min(1),
  preparation_items: z.array(z.string().min(1)).min(1),
  source_type: z.string().min(1),
  clinical_review_status: z.string().min(1),
  review_date: z.string().min(1),
  variability_note: z.string().min(1),
})
type PreparationChecklist = z.infer<typeof PreparationChecklistSchema>

const PreparationChecklistsFileSchema = z.array(PreparationChecklistSchema)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function clearExisting(): Promise<void> {
  // Re-runnable by design, same convention as ingest-kb.ts/seed-directory.ts.
  const { error } = await supabase.from("preparation_checklists").delete().not("id", "is", null)
  if (error) {
    throw new Error(`Failed clearing existing preparation_checklists: ${error.message}`)
  }
}

async function insertChecklists(checklists: PreparationChecklist[]): Promise<void> {
  const rows = checklists.map((checklist) => ({
    service: checklist.service,
    title: checklist.title,
    preparation_items: checklist.preparation_items,
    source_type: checklist.source_type,
    clinical_review_status: checklist.clinical_review_status,
    review_date: checklist.review_date,
    variability_note: checklist.variability_note,
  }))

  const { error } = await supabase.from("preparation_checklists").insert(rows)
  if (error) {
    throw new Error(`Failed inserting preparation_checklists: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "data/preparation_checklists.json"), "utf-8"))
  const checklists = PreparationChecklistsFileSchema.parse(raw)

  console.log(`Loaded ${checklists.length} checklists from data/preparation_checklists.json`)
  console.log("Clearing existing preparation_checklists rows...")
  await clearExisting()

  console.log("Inserting...")
  await insertChecklists(checklists)

  console.log(`Done. ${checklists.length} rows inserted into preparation_checklists.`)
  console.log("")
  console.log(
    "NOTE: every row's clinical_review_status is 'drafted_pending_clinical_review' — this content has not " +
      "had a clinical review pass yet (same open-question standard already applied to the Pidgin refusal " +
      "copy). See progress-tracker.md Open Questions before treating this as clinically approved.",
  )
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exitCode = 1
})
