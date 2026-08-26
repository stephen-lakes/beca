import { MessageCircleQuestion } from "lucide-react"

// Closes the blank-screen gap Spec 08 Decision 4 deliberately left open —
// renders when messages.length === 0. Copy taken verbatim from
// app-flow.md's own example rather than invented fresh. No clickable
// "tap to fill the input" affordance — app-flow.md only calls for
// descriptive text, not an interactive chip (Spec 12 nicety if wanted).
// See context/specs/10-disclaimer-privacy-error-empty-states.md Decision 5.
export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-card text-ink-soft">
        <MessageCircleQuestion className="size-6" aria-hidden="true" />
      </div>
      <p className="text-sm text-ink-soft">Ask about vaccines, a clinic, or how to prepare for an appointment.</p>
    </div>
  )
}
