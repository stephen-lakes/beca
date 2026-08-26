/**
 * app/api/chat/route.ts — POST /api/chat
 *
 * The RAG portion of the pipeline (Spec 05). No urgency classifier or
 * escalation branch yet (Spec 06).
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { searchKb } from "@/lib/kb/search"
import { generateAnswer } from "@/lib/ai/client"
import { NO_GROUNDED_INFO_MESSAGE, GENERATION_FAILURE_MESSAGE } from "@/lib/ai/schema"

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsedRequest = ChatRequestSchema.safeParse(body)
  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { message } = parsedRequest.data

  const chunks = await searchKb(message)

  // Deterministic short-circuit — see context/specs/05-rag-chat-api.md
  // Decision 3. Enforces architecture.md hard invariant 1 without relying
  // on the model's judgment when nothing was even retrieved.
  if (chunks.length === 0) {
    return NextResponse.json(
      { grounded: false, answer: NO_GROUNDED_INFO_MESSAGE, citations: [] },
      { status: 200 },
    )
  }

  const result = await generateAnswer(message, chunks)

  if (!result) {
    console.error("generateAnswer failed after retry for message:", message)
    return NextResponse.json({ error: GENERATION_FAILURE_MESSAGE }, { status: 500 })
  }

  return NextResponse.json(result, { status: 200 })
}
