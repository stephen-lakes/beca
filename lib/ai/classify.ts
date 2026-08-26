/**
 * lib/ai/classify.ts — the AI urgency classifier (Spec 06).
 *
 * Same parse/validate/one-retry contract lib/ai/client.ts's generateAnswer
 * uses: structured output via OpenAI, cross-checked for internal
 * consistency, retried once, null on repeated failure. This module only
 * reports success/failure — it never decides the caller's fallback
 * behavior. See context/specs/06-urgency-classifier-escalation.md Decision 8
 * for what app/api/chat/route.ts does with a null result (degrade to the
 * deterministic red-flag check alone, not a request failure).
 */

import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { UrgencyClassificationSchema, type UrgencyClassification } from "@/lib/ai/schema"
import { buildClassifierMessages } from "@/lib/ai/prompts"

// Same model as lib/ai/client.ts's generateAnswer — see that file's comment
// and progress-tracker.md Architecture Decisions for the model choice.
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

async function requestClassification(message: string): Promise<UrgencyClassification | null> {
  let completion
  try {
    completion = await openai.chat.completions.parse({
      model: MODEL,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: "low", // urgency classification, not a hard reasoning task
      messages: buildClassifierMessages(message),
      response_format: zodResponseFormat(UrgencyClassificationSchema, "urgency_classification"),
    })
  } catch (error) {
    // Deliberately broad catch — see lib/ai/client.ts's comment on why a
    // narrow instanceof check would miss a genuine schema-mismatch case
    // with the installed `openai` SDK.
    console.error("OpenAI urgency classification failed:", error)
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
  // schema itself — see UrgencyClassificationSchema's comment in schema.ts.
  const consistent = parsed.urgent
    ? parsed.category !== null && parsed.severity !== null
    : parsed.category === null && parsed.severity === null

  if (!consistent) {
    return null
  }

  return parsed
}

export async function classifyUrgency(message: string): Promise<UrgencyClassification | null> {
  const first = await requestClassification(message)
  if (first) return first

  // One retry, same contract as generateAnswer (code-standards.md: "A
  // malformed response is retried once, then falls back to a safe canned
  // response").
  return requestClassification(message)
}
