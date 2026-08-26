/**
 * app/api/services/route.ts — GET /api/services?category=<value>
 *
 * Thin GET wrapper over lib/directory/lookup.ts's findDirectoryEntry — named
 * in architecture.md's folder structure since Spec 01 but not assigned to a
 * build-plan unit until now. See
 * context/specs/06-urgency-classifier-escalation.md Decision 10.
 *
 * app/api/chat/route.ts does NOT call this route internally — it imports
 * findDirectoryEntry directly, same pattern as its existing searchKb /
 * generateAnswer calls, to avoid an internal HTTP self-fetch.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { findDirectoryEntry } from "@/lib/directory/lookup"
import { DirectoryCategorySchema } from "@/lib/ai/schema"

const QuerySchema = z.object({
  category: DirectoryCategorySchema,
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsedQuery = QuerySchema.safeParse({ category: searchParams.get("category") })

  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Missing or invalid category" }, { status: 400 })
  }

  const entries = await findDirectoryEntry(parsedQuery.data.category)

  return NextResponse.json({ entries }, { status: 200 })
}
