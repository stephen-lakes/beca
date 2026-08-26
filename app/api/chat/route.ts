/**
 * app/api/chat/route.ts — POST /api/chat
 *
 * Spec 06 adds the classification + escalation branch ahead of Spec 05's
 * RAG flow: the deterministic red-flag check and the AI urgency classifier
 * always both run, in parallel, on every message (Decision 2). If either
 * flags urgency, the escalation response is returned immediately — the RAG
 * path (searchKb / generateAnswer) is never reached for that message
 * (Decision 4), matching app-flow.md: the escalation card renders in place
 * of a plain answer bubble, not alongside one.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { searchKb } from "@/lib/kb/search"
import { generateAnswer } from "@/lib/ai/client"
import { classifyUrgency } from "@/lib/ai/classify"
import { checkRedFlagKeywords, findDirectoryEntry } from "@/lib/directory/lookup"
import {
  ChatResponseSchema,
  EscalationResponseSchema,
  NO_GROUNDED_INFO_MESSAGE,
  NO_GROUNDED_INFO_MESSAGE_SIMPLE,
  NO_GROUNDED_INFO_MESSAGE_PIDGIN,
  GENERATION_FAILURE_MESSAGE,
  HIGH_SEVERITY_MESSAGE,
  MEDIUM_SEVERITY_MESSAGE,
} from "@/lib/ai/schema"

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
})

// Decision 6: take the higher severity when both signals fired. Only ever
// called with at least one non-null input inside the escalation branch
// below, but written to tolerate two nulls anyway rather than assume that.
function higherSeverity(
  a: "high" | "medium" | null | undefined,
  b: "high" | "medium" | null | undefined,
): "high" | "medium" | null {
  if (a === "high" || b === "high") return "high"
  return a ?? b ?? null
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsedRequest = ChatRequestSchema.safeParse(body)
  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { message } = parsedRequest.data

  // Decision 2: always run both checks, in parallel, on every message —
  // never short-circuited by each other.
  const [redFlagMatch, aiClassification] = await Promise.all([
    checkRedFlagKeywords(message),
    classifyUrgency(message),
  ])

  if (!aiClassification) {
    // Decision 8: classifier failure degrades to deterministic-only, not to
    // a failed request — the exact-phrasing safety net is still active.
    // Spec 10: logs message.length, never the raw message text — see
    // context/specs/10-disclaimer-privacy-error-empty-states.md's
    // "Found and fixed" section (architecture.md hard invariant 4).
    console.error("classifyUrgency failed after retry for message of length:", message.length)
  }

  const aiFlagged = aiClassification?.urgent === true

  if (redFlagMatch || aiFlagged) {
    // Decision 6: prefer the deterministic hit's category (a direct
    // red_flag_rules value, more precise than the classifier's free-form
    // judgment); fall back to the AI classifier's category if only it fired.
    const category = redFlagMatch?.category ?? aiClassification?.category
    const severity = higherSeverity(redFlagMatch?.severity, aiFlagged ? aiClassification?.severity : null)

    // Unreachable in practice — at least one of redFlagMatch/aiClassification
    // is guaranteed non-null-with-a-category/severity inside this branch
    // (checkRedFlagKeywords always returns a category+severity together;
    // classifyUrgency's consistency check guarantees non-null category and
    // severity whenever urgent is true) — but handled explicitly rather
    // than assumed, per Decision 9's own reasoning.
    if (!category || !severity) {
      // Spec 10: logs message.length, never the raw message text — see
      // context/specs/10-disclaimer-privacy-error-empty-states.md's
      // "Found and fixed" section (architecture.md hard invariant 4).
      console.error(
        "Escalation branch entered without a resolvable category/severity for message of length:",
        message.length,
      )
      return NextResponse.json({ error: GENERATION_FAILURE_MESSAGE }, { status: 500 })
    }

    const matchedEntries = await findDirectoryEntry(category)

    const escalationResponse = EscalationResponseSchema.parse({
      escalated: true,
      category,
      severity,
      message: severity === "high" ? HIGH_SEVERITY_MESSAGE : MEDIUM_SEVERITY_MESSAGE,
      matched_entries: matchedEntries,
    })

    return NextResponse.json(escalationResponse, { status: 200 })
  }

  // Not urgent — Spec 05's RAG flow, unchanged apart from escalated: false.
  const chunks = await searchKb(message)

  // Deterministic short-circuit — see context/specs/05-rag-chat-api.md
  // Decision 3. Enforces architecture.md hard invariant 1 without relying
  // on the model's judgment when nothing was even retrieved.
  if (chunks.length === 0) {
    return NextResponse.json(
      ChatResponseSchema.parse({
        escalated: false,
        grounded: false,
        answer: NO_GROUNDED_INFO_MESSAGE,
        citations: [],
        // Spec 09: this path never calls the model, so these are the fixed
        // constants, not model-generated — see lib/ai/schema.ts.
        simple_version: NO_GROUNDED_INFO_MESSAGE_SIMPLE,
        pidgin_version: NO_GROUNDED_INFO_MESSAGE_PIDGIN,
      }),
      { status: 200 },
    )
  }

  const result = await generateAnswer(message, chunks)

  if (!result) {
    // Spec 10: logs message.length, never the raw message text — see
    // context/specs/10-disclaimer-privacy-error-empty-states.md's
    // "Found and fixed" section (architecture.md hard invariant 4).
    console.error("generateAnswer failed after retry for message of length:", message.length)
    return NextResponse.json({ error: GENERATION_FAILURE_MESSAGE }, { status: 500 })
  }

  return NextResponse.json(result, { status: 200 })
}
