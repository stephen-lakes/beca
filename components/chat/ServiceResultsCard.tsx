import { MapPin } from "lucide-react"

import type { ServiceNavigationResponse } from "@/lib/ai/schema"

// service_navigation's rendering (context/specs/20-capability-router-and-navigation.md)
// — a new card, not a MessageBubble variant or a reuse of EscalationCard,
// following the exact precedent EscalationCard/ClarificationCard already
// set: a state with its own meaning gets its own component. Deliberately
// calm, not alarming — brand teal, not urgent red, no role="alert" — this is
// routine navigation, not a safety event; ui-context.md reserves the
// "unmistakable visual break" language for the escalation card alone
// (ClarificationCard's own comment already made the same call for the
// clarification state). Entries are rendered exactly the way EscalationCard
// already renders matched_entries (name / area / contact / verified
// qualifier) — a small, deliberate duplication of ~15 lines rather than
// refactoring EscalationCard itself, which is safety-critical, already-live,
// already-tested code not worth adding a shared-component risk to for this.
export function ServiceResultsCard({ response }: { response: ServiceNavigationResponse }) {
  const { message, matched_entries } = response

  return (
    <div
      role="status"
      className="w-full rounded-2xl border-t-4 border-brand bg-brand/5 px-4 py-4"
    >
      <div className="flex items-start gap-2.5">
        <MapPin className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="flex-1 space-y-3">
          <p className="text-sm text-ink">{message}</p>

          {matched_entries.length > 0 && (
            <ul className="space-y-2">
              {matched_entries.map((entry) => (
                <li
                  key={`${entry.name}-${entry.area ?? ""}`}
                  className="rounded-lg border border-brand/20 bg-background px-3 py-2 text-sm"
                >
                  <p className="font-medium text-ink">{entry.name}</p>
                  {entry.area && <p className="text-ink-soft">{entry.area}</p>}
                  {entry.verified === "name-only" ? (
                    <p className="text-ink-soft">Contact unconfirmed — no number on file</p>
                  ) : (
                    entry.contact && (
                      <p className="text-ink-soft">
                        {entry.contact}
                        {entry.verified !== "true" && (
                          // Deliberately NOT text-urgent — ui-context.md reserves that
                          // token for the escalation card alone ("never used for
                          // anything else"). This app has no separate "warning" token,
                          // so the unconfirmed qualifier is styled/labelled plainly
                          // instead of color-coded, matching this card's calmer intent.
                          <span className="ml-1 text-xs italic text-ink-soft">(unconfirmed)</span>
                        )}
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-ink-soft">
            This is a small, hand-curated directory, not a comprehensive map — always confirm details with the
            facility directly.
          </p>
        </div>
      </div>
    </div>
  )
}
