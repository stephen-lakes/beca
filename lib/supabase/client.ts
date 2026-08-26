/**
 * lib/supabase/client.ts — single shared server-only Supabase client.
 *
 * Per architecture.md: lib/kb/ and lib/directory/ are the only modules that
 * query Supabase, and they do it through this client. Server-only — never
 * imported by components/ or any client-side code (uses the service-role
 * key, which bypasses RLS).
 *
 * Next.js loads .env.local automatically for server code — no manual env
 * loading needed here (that's only required in scripts/, which run outside
 * the Next.js process).
 */

import { createClient } from "@supabase/supabase-js"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name} (check .env.local)`)
  }
  return value
}

export const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"))
