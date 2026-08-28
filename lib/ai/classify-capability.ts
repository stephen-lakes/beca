/**
 * lib/ai/classify-capability.ts — the capability router
 * (context/specs/20-capability-router-and-navigation.md).
 *
 * Same parse/validate/one-retry contract lib/ai/classify.ts's
 * classifyUrgency uses. The critical architectural fact about this module,
 * repeated at its one call site in app/api/chat/route.ts: it only ever runs
 * on a message that has already fallen through the existing safety branch
 * (deterministic red-flag check + AI urgency classifier, Specs 06/17) —
 * never before it, never in place of it. This is a routing classifier, not a
 * safety mechanism (Part 4 of the 2026-08-28 task: "do not make this
 * classifier the sole safety mechanism").
 */

import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { CapabilityClassificationSchema, type CapabilityClassification } from "@/lib/ai/schema"
import { buildCapabilityClassifierMessages } from "@/lib/ai/prompts"

// Same model as lib/ai/classify.ts's urgency classifier — see that file's
// comment and progress-tracker.md Architecture Decisions for the model choice.
const MODEL = "gpt-5.6-terra"
const MAX_COMPLETION_TOKENS = 512

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name} (check .env.local)`)
  }
  return value
}

const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") })

async function requestCapabilityClassification(message: string): Promise<CapabilityClassification | null> {
  let completion
  try {
    completion = await openai.chat.completions.parse({
      model: MODEL,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: "low", // routing classification, not a hard reasoning task
      messages: buildCapabilityClassifierMessages(message),
      response_format: zodResponseFormat(CapabilityClassificationSchema, "capability_classification"),
    })
  } catch (error) {
    // Deliberately broad catch — see lib/ai/client.ts's comment on why a
    // narrow instanceof check would miss a genuine schema-mismatch case
    // with the installed `openai` SDK.
    console.error("OpenAI capability classification failed:", error)
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

  // Cross-field consistency zod can't express inside the structured-output
  // schema itself — same reasoning as UrgencyClassificationSchema's
  // consistency check in lib/ai/classify.ts.
  const preparationConsistent =
    parsed.capability === "healthcare_preparation"
      ? parsed.preparation_service !== null
      : parsed.preparation_service === null
  const navigationConsistent =
    parsed.capability === "service_navigation" ? parsed.navigation_service !== null : parsed.navigation_service === null

  if (!preparationConsistent || !navigationConsistent) {
    return null
  }

  return parsed
}

export async function classifyCapability(message: string): Promise<CapabilityClassification | null> {
  const first = await requestCapabilityClassification(message)
  if (first) return first

  // One retry, same contract as classifyUrgency/generateAnswer
  // (code-standards.md: "A malformed response is retried once, then falls
  // back to a safe canned response").
  return requestCapabilityClassification(message)
}
