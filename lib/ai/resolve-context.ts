/**
 * lib/ai/resolve-context.ts — conversation context resolution
 * (context/specs/23-conversation-context-resolution.md).
 *
 * Same parse/validate/one-retry/degrade contract lib/ai/classify.ts and
 * lib/ai/classify-capability.ts both use. The critical architectural fact
 * about this module, repeated at its one call site in
 * app/api/chat/route.ts: it only ever runs on a message that has already
 * fallen through the existing safety branch (deterministic red-flag check +
 * AI urgency classifier, Specs 06/17), and its result is fed only to the
 * capability classifier and the RAG path below it — never back into the
 * safety layer (Decision 1). This is a retrieval/routing refinement, not a
 * safety mechanism, the same boundary architecture.md hard invariant 7
 * already established for the capability router.
 *
 * resolveQuery() is deliberately skipped by the caller (Decision 4) when
 * there's no recentHistory to resolve against — this file always makes the
 * call it's given, it has no opinion on when to skip.
 */

import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { ResolvedContextSchema, type ResolvedContext, type ConversationTurn } from "@/lib/ai/schema"
import { buildContextResolutionMessages } from "@/lib/ai/prompts"

// Same model as lib/ai/classify.ts / lib/ai/classify-capability.ts — see
// those files' comments and progress-tracker.md Architecture Decisions for
// the model choice.
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

async function requestResolution(
  message: string,
  recentHistory: ConversationTurn[],
): Promise<ResolvedContext | null> {
  let completion
  try {
    completion = await openai.chat.completions.parse({
      model: MODEL,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: "low", // a self-contained-or-not judgment, not a hard reasoning task
      messages: buildContextResolutionMessages(message, recentHistory),
      response_format: zodResponseFormat(ResolvedContextSchema, "resolved_context"),
    })
  } catch (error) {
    // Deliberately broad catch — see lib/ai/client.ts's comment on why a
    // narrow instanceof check would miss a genuine schema-mismatch case
    // with the installed `openai` SDK.
    console.error("OpenAI context resolution failed:", error)
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

  return parsed
}

// Diagnostic-only, mirroring lib/kb/search.ts's matchedVia field and Spec
// 19's retrieval_outcome log values — never shown to the user, message text
// never included (hard invariant 4), only message.length at the call site.
export type ContextResolutionOutcome = "skipped_no_history" | "resolved" | "unchanged" | "failed_degraded"

// Returns the message to actually use downstream, with Decision 3's
// substitution rule already applied — callers never need to re-check
// needs_resolution themselves. Never throws and never fails the caller's
// request (Decision 5): any failure degrades to the original, raw message.
export async function resolveQuery(
  message: string,
  recentHistory: ConversationTurn[] | undefined | null,
): Promise<{ resolvedMessage: string; outcome: ContextResolutionOutcome }> {
  // Decision 4: a hard skip, not a classifier call that trivially returns
  // needs_resolution: false — there's nothing to resolve against on a
  // thread's first message, so no LLM call is made at all.
  if (!recentHistory || recentHistory.length === 0) {
    return { resolvedMessage: message, outcome: "skipped_no_history" }
  }

  let result = await requestResolution(message, recentHistory)
  if (!result) {
    // One retry, same contract as classifyUrgency/classifyCapability/
    // generateAnswer (code-standards.md: "A malformed response is retried
    // once, then falls back to a safe canned response").
    result = await requestResolution(message, recentHistory)
  }

  if (!result) {
    return { resolvedMessage: message, outcome: "failed_degraded" }
  }

  if (!result.needs_resolution) {
    // Decision 3: the model's own copy of an already-self-contained message
    // is discarded, never trusted — the original raw message is used
    // unchanged, even though presumably near-identical.
    return { resolvedMessage: message, outcome: "unchanged" }
  }

  return { resolvedMessage: result.resolved_query, outcome: "resolved" }
}
