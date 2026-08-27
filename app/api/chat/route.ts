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
 *
 * Spec 17 adds a third possible outcome ahead of the escalation branch:
 * when the classifier can't confidently decide from the message alone, it
 * may ask up to two clarifying questions instead of guessing. Capped at one
 * round — enforced here, not left to the model's prompt-following alone, see
 * the forcedUrgentOverride comment below. See
 * context/specs/17-triage-clarification-classifier.md.
 *
 * Spec 19 adds A-E fallback-outcome logging around the RAG flow's three
 * no-answer exit points, distinguishing "retrieval found nothing" (D),
 * "retrieval found something but the model judged it insufficient" (C), and
 * "the retrieval call itself failed" (B) — previously indistinguishable in
 * logs (a thrown searchKb error was unhandled here before this spec). No
 * response shape, status code, or user-facing behavior changes as a result —
 * this is diagnostic-only, and never logs raw message text (hard invariant
 * 4). See context/specs/19-hybrid-retrieval-fallback-diagnostics.md Decision 4.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { searchKb, type RetrievedChunk } from "@/lib/kb/search"
import { generateAnswer } from "@/lib/ai/client"
import { classifyUrgency } from "@/lib/ai/classify"
import { checkRedFlagKeywords, findDirectoryEntry } from "@/lib/directory/lookup"
import {
  ChatResponseSchema,
  EscalationResponseSchema,
  ClarificationResponseSchema,
  PriorClarificationSchema,
  NO_GROUNDED_INFO_MESSAGE,
  NO_GROUNDED_INFO_MESSAGE_SIMPLE,
  NO_GROUNDED_INFO_MESSAGE_PIDGIN,
  GENERATION_FAILURE_MESSAGE,
  HIGH_SEVERITY_MESSAGE,
  MEDIUM_SEVERITY_MESSAGE,
} from "@/lib/ai/schema"

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  // Spec 17 Decision 1: present only on the one turn immediately following a
  // Clarification-state render — the client's reply to the classifier's own
  // question(s). The server stays fully stateless; nothing here is ever
  // persisted, only read for this single request.
  priorClarification: PriorClarificationSchema.nullable().optional(),
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

  const { message, priorClarification } = parsedRequest.data

  // Decision 2 (Spec 06): always run both checks, in parallel, on every
  // message — never short-circuited by each other. Spec 17: classifyUrgency
  // also takes priorClarification, folding it into a combined-context,
  // final-round prompt when present (lib/ai/prompts.ts).
  const [redFlagMatch, aiClassification] = await Promise.all([
    checkRedFlagKeywords(message),
    classifyUrgency(message, priorClarification),
  ])

  if (!aiClassification) {
    // Decision 8: classifier failure degrades to deterministic-only, not to
    // a failed request — the exact-phrasing safety net is still active.
    // Spec 10: logs message.length, never the raw message text — see
    // context/specs/10-disclaimer-privacy-error-empty-states.md's
    // "Found and fixed" section (architecture.md hard invariant 4).
    console.error("classifyUrgency failed after retry for message of length:", message.length)
  }

  const aiOutcome = aiClassification?.outcome

  // Spec 17 Decision 4: the one-round clarification cap enforced structurally,
  // not left to the model's prompt-following alone (buildFinalRoundAddendum
  // in lib/ai/prompts.ts is the other half of this belt-and-suspenders pair).
  // If this request already carried priorClarification — i.e. this is the
  // reply to a clarifying question already asked — and the classifier still
  // returned "needs_clarification", that's a prompt-adherence failure that
  // must never reach the user as a second question. Override to urgent
  // instead, using the classifier's own best-guess category/severity, which
  // is populated on every "needs_clarification" outcome for exactly this
  // reason (see UrgencyClassificationSchema in lib/ai/schema.ts) — so this
  // override never needs a second model call or hits a null-category gap.
  const forcedUrgentOverride = Boolean(priorClarification) && aiOutcome === "needs_clarification"

  const aiFlagged = aiOutcome === "urgent" || forcedUrgentOverride

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
    // severity whenever outcome is "urgent" — and, since Spec 17, whenever
    // outcome is "needs_clarification" too, which is what forcedUrgentOverride
    // relies on) — but handled explicitly rather than assumed, per Decision
    // 9's own reasoning.
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
      needs_clarification: false,
      category,
      severity,
      message: severity === "high" ? HIGH_SEVERITY_MESSAGE : MEDIUM_SEVERITY_MESSAGE,
      matched_entries: matchedEntries,
    })

    return NextResponse.json(escalationResponse, { status: 200 })
  }

  // Spec 17: genuine first-round ambiguity — ask up to two clarifying
  // questions instead of guessing. Never reachable when priorClarification
  // was already present on this request: forcedUrgentOverride above claims
  // that case first (it flows into the escalation branch, not here), so this
  // can only fire once per thread, matching the app-flow.md cap.
  if (aiOutcome === "needs_clarification") {
    const clarificationResponse = ClarificationResponseSchema.parse({
      escalated: false,
      needs_clarification: true,
      questions: aiClassification!.clarifying_questions,
    })

    return NextResponse.json(clarificationResponse, { status: 200 })
  }

  // Not urgent — Spec 05's RAG flow, unchanged apart from escalated: false /
  // needs_clarification: false.
  //
  // Spec 19 Decision 4: searchKb is now wrapped in try/catch — previously an
  // exception here was unhandled and surfaced as a generic framework error,
  // indistinguishable in logs from any other crash. Case B below makes that
  // distinguishable; the response shape/status returned to the client is
  // identical to the existing generateAnswer-failure path (no new behavior).
  let chunks: RetrievedChunk[]
  try {
    chunks = await searchKb(message)
  } catch (error) {
    console.error(
      "searchKb failed for message of length:",
      message.length,
      "— retrieval_outcome: B_retrieval_error —",
      error instanceof Error ? error.message : String(error),
    )
    return NextResponse.json({ error: GENERATION_FAILURE_MESSAGE }, { status: 500 })
  }

  // Deterministic short-circuit — see context/specs/05-rag-chat-api.md
  // Decision 3. Enforces architecture.md hard invariant 1 without relying
  // on the model's judgment when nothing was even retrieved.
  if (chunks.length === 0) {
    // Spec 19 Decision 4: case D — hybrid retrieval matched nothing on
    // either channel, most likely a genuine KB-coverage gap rather than a
    // retrieval/threshold defect. Never logs message text, only its length.
    console.log("retrieval_outcome: D_no_match — message length:", message.length)
    return NextResponse.json(
      ChatResponseSchema.parse({
        escalated: false,
        needs_clarification: false,
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

  if (!result.grounded) {
    // Spec 19 Decision 4: case C — something was retrieved, but the model
    // itself judged it didn't adequately answer the specific question
    // (lib/ai/prompts.ts's existing grounded:false self-report, unchanged).
    // Distinct from case D: the topic likely exists, just not the answer to
    // this exact question. Diagnostic numbers only, never message text.
    const matchedViaCounts = chunks.reduce<Record<string, number>>((counts, chunk) => {
      counts[chunk.matchedVia] = (counts[chunk.matchedVia] ?? 0) + 1
      return counts
    }, {})
    console.log(
      "retrieval_outcome: C_insufficient_evidence — message length:",
      message.length,
      "chunkCount:",
      chunks.length,
      "topSimilarity:",
      Math.max(...chunks.map((chunk) => chunk.similarity)),
      "matchedVia:",
      matchedViaCounts,
    )
  }

  return NextResponse.json(result, { status: 200 })
}
