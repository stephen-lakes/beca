import { AlertTriangle } from "lucide-react"

import type { EscalationResponse } from "@/lib/ai/schema"

// Never a chat bubble — app-flow.md state 3 is explicit that this is its
// own visually distinct card. Full width, urgent top border, urgent-soft
// background, inline disclaimer line, per ui-context.md. Color is never the
// only signal: the AlertTriangle icon + "Please seek care" label carry the
// meaning independently, per ui-context.md's accessibility section.
export function EscalationCard({ response }: { response: EscalationResponse }) {
  const { message, matched_entries } = response

  return (
    <div
      role="alert"
      // Spec 12 Decision 3: entrance animation for "the single highest-value
      // asset in the build" (ui-context.md) — tw-animate-css utility classes
      // (already imported, confirmed present in the installed package
      // version). motion-reduce:animate-none is Tailwind core, respecting
      // prefers-reduced-motion.
      className="w-full animate-in rounded-2xl border-t-4 border-urgent bg-urgent-soft px-4 py-4 fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-urgent" aria-hidden="true" />
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-urgent">Please seek care</p>
            <p className="mt-1 text-sm text-ink">{message}</p>
          </div>

          {matched_entries.length > 0 && (
            <ul className="space-y-2">
              {matched_entries.map((entry) => (
                <li
                  key={`${entry.name}-${entry.area ?? ""}`}
                  className="rounded-lg border border-urgent/20 bg-background px-3 py-2 text-sm"
                >
                  <p className="font-medium text-ink">{entry.name}</p>
                  {entry.area && <p className="text-ink-soft">{entry.area}</p>}
                  {entry.verified === "name-only" ? (
                    // contact is null in this case (database-schema.md) —
                    // nothing to show, so state that plainly instead.
                    <p className="text-ink-soft">Contact unconfirmed — no number on file</p>
                  ) : (
                    entry.contact && (
                      <p className="text-ink-soft">
                        {entry.contact}
                        {entry.verified !== "true" && (
                          <span className="ml-1 text-xs text-urgent">(unconfirmed)</span>
                        )}
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-ink-soft">
            This is general information, not a diagnosis — always follow the advice of a qualified health worker.
          </p>
        </div>
      </div>
    </div>
  )
}
