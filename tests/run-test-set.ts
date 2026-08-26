/**
 * tests/run-test-set.ts — Spec 11: test-set script
 *
 * Runs tests/test-queries.json against a live /api/chat endpoint — the
 * deployed build by default (context/specs/11-test-set-script.md Decision
 * 6) — sequentially (Decision 7), classifying each query's response per
 * Decision 4, and reporting two separate headline numbers per Decision 5:
 * overall pass rate and the escalated-category pass rate on its own line.
 *
 * Usage:
 *   npm run test-set
 *   npm run test-set -- --target=http://localhost:3000
 *   TEST_TARGET_URL=http://localhost:3000 npm run test-set
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { z } from "zod"

// ---------------------------------------------------------------------------
// Env — loaded from .env.local, same convention as scripts/seed-directory.ts.
// Not actually required by this script (it only calls the deployed HTTP
// API, never Supabase/OpenAI directly), but loaded anyway in case a local
// .env.local sets TEST_TARGET_URL.
// ---------------------------------------------------------------------------

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"))
} catch {
  // .env.local not found or unreadable — fine, TEST_TARGET_URL/--target are
  // both optional (Decision 6).
}

const DEFAULT_TARGET_URL = "https://beca-self.vercel.app"

function resolveTargetUrl(): string {
  const cliArg = process.argv.find((arg) => arg.startsWith("--target="))
  if (cliArg) return cliArg.slice("--target=".length)
  if (process.env.TEST_TARGET_URL) return process.env.TEST_TARGET_URL
  return DEFAULT_TARGET_URL
}

// ---------------------------------------------------------------------------
// tests/test-queries.json — validated shape (code-standards.md: validate
// all external input with zod), same pattern scripts/seed-directory.ts
// already applies to its own data files.
// ---------------------------------------------------------------------------

const TestQuerySchema = z.object({
  id: z.number(),
  category: z.enum(["grounded", "refused", "escalated"]),
  query: z.string().min(1),
  expected_category: z.string().optional(),
  expected_severity: z.enum(["high", "medium"]).optional(),
  notes: z.string().optional(),
})
type TestQuery = z.infer<typeof TestQuerySchema>

const TestQueriesFileSchema = z.array(TestQuerySchema)

// ---------------------------------------------------------------------------
// The /api/chat response shapes this script cares about — deliberately
// loose (z.unknown() passthrough-ish) rather than importing lib/ai/schema.ts
// directly: this script simulates an external HTTP client hitting the
// deployed build, the same way a browser does, not an internal caller with
// access to the server's own types. Only the fields actually needed for
// pass/fail classification (Decision 4) are asserted.
// ---------------------------------------------------------------------------

const ChatApiResponseSchema = z.object({
  escalated: z.boolean(),
  grounded: z.boolean().optional(),
  citations: z.array(z.unknown()).optional(),
  simple_version: z.string().optional(),
  pidgin_version: z.string().optional(),
  category: z.string().optional(),
  severity: z.string().optional(),
  matched_entries: z.array(z.unknown()).optional(),
})

// ---------------------------------------------------------------------------
// Pass/fail classification — Decision 4. Structural, not content-graded;
// loose on category-guessing, strict on the one signal each category
// exists to prove.
// ---------------------------------------------------------------------------

type Verdict = {
  pass: boolean
  reason: string
  categoryMatch: "n/a" | "match" | "mismatch"
}

function classify(testQuery: TestQuery, response: z.infer<typeof ChatApiResponseSchema>): Verdict {
  if (testQuery.category === "grounded") {
    const pass =
      response.escalated === false &&
      response.grounded === true &&
      (response.citations?.length ?? 0) > 0 &&
      !!response.simple_version &&
      !!response.pidgin_version
    return { pass, reason: pass ? "grounded with citation(s)" : "expected a grounded, cited answer", categoryMatch: "n/a" }
  }

  if (testQuery.category === "refused") {
    const pass =
      response.escalated === false &&
      response.grounded === false &&
      !!response.simple_version &&
      !!response.pidgin_version
    return { pass, reason: pass ? "correctly refused (no grounded info)" : "expected a refusal, not a grounded answer", categoryMatch: "n/a" }
  }

  // escalated — Decision 4: only `escalated === true` decides pass/fail.
  // category/severity are informational only, never flip the verdict.
  const pass = response.escalated === true
  let categoryMatch: Verdict["categoryMatch"] = "n/a"
  if (pass && testQuery.expected_category) {
    categoryMatch = response.category === testQuery.expected_category ? "match" : "mismatch"
  }
  return {
    pass,
    reason: pass ? "escalated as expected" : "expected escalation, got a plain answer — investigate before the demo",
    categoryMatch,
  }
}

// ---------------------------------------------------------------------------
// Runner — sequential, continue-on-failure (Decisions 7–8).
// ---------------------------------------------------------------------------

type ResultRow = {
  id: number
  category: TestQuery["category"]
  query: string
  pass: boolean
  reason: string
  categoryMatch: Verdict["categoryMatch"]
  httpStatus: number | null
  error: string | null
}

async function runQuery(targetUrl: string, testQuery: TestQuery): Promise<ResultRow> {
  try {
    const res = await fetch(`${targetUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testQuery.query }),
    })

    const json = await res.json().catch(() => null)

    if (!res.ok || json === null) {
      return {
        id: testQuery.id,
        category: testQuery.category,
        query: testQuery.query,
        pass: false,
        reason: `HTTP ${res.status}${json?.error ? `: ${json.error}` : ""}`,
        categoryMatch: "n/a",
        httpStatus: res.status,
        error: null,
      }
    }

    const parsed = ChatApiResponseSchema.safeParse(json)
    if (!parsed.success) {
      return {
        id: testQuery.id,
        category: testQuery.category,
        query: testQuery.query,
        pass: false,
        reason: "response failed shape validation",
        categoryMatch: "n/a",
        httpStatus: res.status,
        error: parsed.error.message,
      }
    }

    const verdict = classify(testQuery, parsed.data)
    return {
      id: testQuery.id,
      category: testQuery.category,
      query: testQuery.query,
      pass: verdict.pass,
      reason: verdict.reason,
      categoryMatch: verdict.categoryMatch,
      httpStatus: res.status,
      error: null,
    }
  } catch (error) {
    // Decision 8: a network/parse failure on one query is a failed row,
    // not a fatal script error — the run continues with the rest.
    return {
      id: testQuery.id,
      category: testQuery.category,
      query: testQuery.query,
      pass: false,
      reason: "request failed",
      categoryMatch: "n/a",
      httpStatus: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function printSummary(results: ResultRow[]): void {
  console.table(
    results.map((r) => ({
      id: r.id,
      category: r.category,
      pass: r.pass ? "PASS" : "FAIL",
      reason: r.reason,
      categoryMatch: r.categoryMatch,
    })),
  )

  const overallPassRate = (results.filter((r) => r.pass).length / results.length) * 100
  const escalated = results.filter((r) => r.category === "escalated")
  const escalatedPassRate = escalated.length > 0 ? (escalated.filter((r) => r.pass).length / escalated.length) * 100 : null

  console.log("")
  // Decision 5: two separate headline numbers, matching project-overview.md's
  // two distinct bars — never blended into one number.
  console.log(`Overall pass rate: ${overallPassRate.toFixed(1)}% (${results.filter((r) => r.pass).length}/${results.length}) — goal: >= 90%`)
  if (escalatedPassRate !== null) {
    console.log(
      `Escalated-category pass rate: ${escalatedPassRate.toFixed(1)}% (${escalated.filter((r) => r.pass).length}/${escalated.length}) — goal: 100%`,
    )
  }

  const failures = results.filter((r) => !r.pass)
  if (failures.length > 0) {
    console.log("")
    console.log("Failures:")
    for (const failure of failures) {
      console.log(`  #${failure.id} [${failure.category}] "${failure.query}" — ${failure.reason}${failure.error ? ` (${failure.error})` : ""}`)
    }
  }
}

function writeReport(targetUrl: string, results: ResultRow[]): string {
  const resultsDir = path.join(process.cwd(), "tests", "results")
  mkdirSync(resultsDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const reportPath = path.join(resultsDir, `${timestamp}.json`)

  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        targetUrl,
        ranAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  )

  return reportPath
}

async function main(): Promise<void> {
  const targetUrl = resolveTargetUrl()
  const rawQueries = JSON.parse(readFileSync(path.join(process.cwd(), "tests/test-queries.json"), "utf-8"))
  const queries = TestQueriesFileSchema.parse(rawQueries)

  console.log(`Running ${queries.length} test queries against ${targetUrl} ...`)
  console.log("")

  const results: ResultRow[] = []
  for (const testQuery of queries) {
    process.stdout.write(`  #${testQuery.id} [${testQuery.category}] ${testQuery.query.slice(0, 60)}...`)
    const result = await runQuery(targetUrl, testQuery)
    results.push(result)
    console.log(` ${result.pass ? "PASS" : "FAIL"}`)
  }

  console.log("")
  printSummary(results)

  const reportPath = writeReport(targetUrl, results)
  console.log("")
  console.log(`Full report written to ${reportPath}`)
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exitCode = 1
})
