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
import { classifyCapability } from "@/lib/ai/classify-capability"
import { checkRedFlagKeywords, findDirectoryEntry, findByService } from "@/lib/directory/lookup"
import { findPreparationChecklist, formatChecklistAsChunkContent } from "@/lib/preparation/lookup"
import {
  ChatResponseSchema,
  EscalationResponseSchema,
  ClarificationResponseSchema,
  ServiceNavigationResponseSchema,
  PriorClarificationSchema,
  NO_GROUNDED_INFO_MESSAGE,
  NO_GROUNDED_INFO_MESSAGE_SIMPLE,
  NO_GROUNDED_INFO_MESSAGE_PIDGIN,
  GENERATION_FAILURE_MESSAGE,
  HIGH_SEVERITY_MESSAGE,
  MEDIUM_SEVERITY_MESSAGE,
  type DirectoryEntry,
} from "@/lib/ai/schema"

// 2026-08-28: human-readable labels for service_navigation's fixed,
// deterministic response copy (context/specs/20-capability-router-and-navigation.md)
// — never LLM-generated, same "fixed copy for a structured result" pattern
// HIGH_SEVERITY_MESSAGE/MEDIUM_SEVERITY_MESSAGE already use.
const NAVIGATION_SERVICE_LABELS: Record<string, string> = {
  vaccination: "vaccination",
  antenatal_care: "antenatal care",
  postnatal_care: "postnatal care",
  delivery: "delivery services",
  paediatrics: "paediatric care",
  laboratory: "laboratory testing",
  emergency: "emergency care",
  family_planning: "family planning",
  hiv_services: "HIV services",
  malaria_services: "malaria testing/treatment",
  general_outpatient: "general outpatient care",
  dental: "dental care",
  imaging: "imaging",
  mental_health: "mental health care",
  oncology: "cancer care / oncology services",
}

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

// 2026-08-28: extracted from the inline escalation branch below so the same,
// already-tested escalation shape/copy/directory-lookup logic can also serve
// the capability classifier's secondary "emergency" backstop (Part 4 of
// context/specs/20-capability-router-and-navigation.md) without duplicating
// it — both callers build the exact same EscalationResponseSchema object
// through the exact same directory lookup, never a second, divergent
// escalation mechanism.
async function buildEscalationResponse(category: string, severity: "high" | "medium") {
  const matchedEntries = await findDirectoryEntry(category)

  return EscalationResponseSchema.parse({
    escalated: true,
    needs_clarification: false,
    service_navigation: false,
    category,
    severity,
    message: severity === "high" ? HIGH_SEVERITY_MESSAGE : MEDIUM_SEVERITY_MESSAGE,
    matched_entries: matchedEntries,
  })
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

    const escalationResponse = await buildEscalationResponse(category, severity)

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
      service_navigation: false,
      questions: aiClassification!.clarifying_questions,
    })

    return NextResponse.json(clarificationResponse, { status: 200 })
  }

  // 2026-08-28: capability router (context/specs/20-capability-router-and-navigation.md).
  // Runs only here — after both existing safety signals (deterministic
  // red-flag check + AI urgency classifier) have already cleared this
  // message as not urgent and not needing clarification. This is a
  // routing/topic classifier, never a second safety mechanism (Part 4): the
  // unmodified safety branch above already ran, unconditionally, on every
  // message before this point is ever reached.
  const capabilityClassification = await classifyCapability(message)

  if (!capabilityClassification) {
    // Classifier failure degrades to the default RAG path below, the same
    // "degrade, don't fail the request" pattern Spec 06 Decision 8
    // established for the urgency classifier's own failure mode.
    console.error("classifyCapability failed after retry for message of length:", message.length)
  }

  const capability = capabilityClassification?.capability ?? "health_education"

  // Secondary, independent emergency signal — a belt-and-suspenders catch,
  // not a replacement for the primary safety layer above (which already ran
  // unconditionally and is the thing actually tested at 100% escalation
  // pass rate, see tests/test-queries.json). If this second, independently
  // reasoning classifier still flags "emergency" on a message the primary
  // layer already cleared, that's a genuine disagreement worth escalating
  // on, using the exact same tested escalation machinery/copy — never a
  // second, divergent safety mechanism or new safety copy.
  if (capability === "emergency") {
    console.log(
      "retrieval_outcome: capability_router_emergency_backstop — message length:",
      message.length,
      "— primary safety layer had already cleared this message as not urgent",
    )
    const severity = capabilityClassification!.risk_level === "high" ? "high" : "medium"
    const escalationResponse = await buildEscalationResponse("emergency", severity)
    return NextResponse.json(escalationResponse, { status: 200 })
  }

  // service_navigation (Part 2 Capability 4 / Part 18): entirely
  // deterministic from here — findByService queries the structured
  // directory_entries table, and the response is built from its result with
  // no LLM call at all, so there is no generation step that could invent a
  // facility. A genuine zero-match result is returned honestly, never
  // silently dropped or papered over with a RAG fallback.
  if (capability === "service_navigation" && capabilityClassification!.navigation_service) {
    const service = capabilityClassification!.navigation_service
    const matchedEntries: DirectoryEntry[] = await findByService(service)
    const label = NAVIGATION_SERVICE_LABELS[service] ?? service.replace(/_/g, " ")

    console.log(
      "retrieval_outcome: service_navigation — message length:",
      message.length,
      "service:",
      service,
      "matchCount:",
      matchedEntries.length,
    )

    const serviceNavigationResponse = ServiceNavigationResponseSchema.parse({
      escalated: false,
      needs_clarification: false,
      service_navigation: true,
      service,
      message:
        matchedEntries.length > 0
          ? `Here's what we have on file for ${label} in our directory.`
          : `We don't have a verified facility offering ${label} on file yet. Please check with a nearby primary health centre or the Lagos State Ministry of Health directly.`,
      matched_entries: matchedEntries,
    })

    return NextResponse.json(serviceNavigationResponse, { status: 200 })
  }

  // healthcare_preparation (Part 3): a deterministic, exact-match lookup —
  // never vector search (lib/preparation/lookup.ts). When a structured
  // checklist exists for the identified service, it's fed to the existing,
  // unmodified generateAnswer() as the ONLY retrieved chunk, so the model
  // has nothing else to draw from — this reuses the already-proven
  // faithfulness/citation/simple-pidgin generation contract instead of a
  // second, bespoke one. No matching service, or generation itself fails,
  // falls through to the standard RAG flow below rather than failing the
  // request — the existing internally-authored clinic-appointment-prep
  // topic (data/kb_topics.json #12) still covers general preparation
  // guidance as a safety net.
  if (capability === "healthcare_preparation" && capabilityClassification!.preparation_service) {
    const checklist = await findPreparationChecklist(capabilityClassification!.preparation_service)
    if (checklist) {
      const syntheticChunk: RetrievedChunk = {
        chunkId: `preparation:${checklist.service}`,
        sourceId: `preparation:${checklist.service}`,
        content: formatChecklistAsChunkContent(checklist),
        similarity: 1,
        // Not really from either retrieval channel — this is a deterministic
        // exact-service lookup, not a search result — but the type only has
        // these two values and this field is diagnostic-only, never shown to
        // the user or the model. "keyword" reads closer to "not a similarity
        // ranking" than "vector" would.
        matchedVia: "keyword",
        sourceTitle: checklist.title,
        // Deliberately NOT "clinically reviewed" — checklist.clinicalReviewStatus
        // is "drafted_pending_clinical_review" today (see
        // data/preparation_checklists.json and progress-tracker.md's Open
        // Questions), so the citation label doesn't claim a review pass that
        // hasn't happened, the same honesty standard already applied to the
        // Pidgin refusal copy.
        sourceName: "Beca — preparation guide",
        sourceUrl: null,
      }

      const result = await generateAnswer(message, [syntheticChunk])
      if (result) {
        console.log(
          "retrieval_outcome: healthcare_preparation — message length:",
          message.length,
          "service:",
          checklist.service,
        )
        return NextResponse.json(result, { status: 200 })
      }

      console.error(
        "generateAnswer failed for a healthcare_preparation checklist — falling back to RAG for message of length:",
        message.length,
      )
      // Falls through to the RAG flow below rather than failing the request.
    }
  }

  // Not urgent — Spec 05's RAG flow, unchanged apart from escalated: false /
  // needs_clarification: false. Reached directly for health_education,
  // preventive_health, disease_information, when_to_seek_care,
  // medication_safety, and out_of_scope (Part 2/3: these all reuse this
  // existing, unmodified pipeline — see lib/ai/schema.ts's RAG_CAPABILITIES
  // comment for why), and as the fallback for service_navigation/
  // healthcare_preparation cases that didn't resolve above.
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
    console.log("retrieval_outcome: D_no_match — message length:", message.length, "capability:", capability)
    return NextResponse.json(
      ChatResponseSchema.parse({
        escalated: false,
        needs_clarification: false,
        service_navigation: false,
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
      "capability:",
      capability,
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
