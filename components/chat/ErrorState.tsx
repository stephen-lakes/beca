import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

// Replaces Spec 08's bare inline error <p> with a proper component.
// Deliberately AlertCircle, not AlertTriangle (already EscalationCard's
// icon), and neutral tokens only — never urgent/urgent-soft, which
// ui-context.md reserves for the escalation card alone. Nothing else in the
// UI should risk borrowing the escalation card's visual signature, or a
// real health escalation risks reading as just another error toast. See
// context/specs/10-disclaimer-privacy-error-empty-states.md Decisions 6–7.
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-line bg-card px-4 py-2.5">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden="true" />
      <div className="flex-1 space-y-1.5">
        <p className="text-sm text-ink">{message}</p>
        {/* variant="link" for the generated Button primitive's own
            focus-visible handling (no hand-rolled interactive element) —
            its default `text-primary` is shadcn's own grayscale token, not
            this project's `brand` teal (confirmed separate in
            app/globals.css), so it's overridden explicitly per
            ui-context.md: "brand — interactive elements, links". */}
        <Button type="button" variant="link" onClick={onRetry} className="h-auto p-0 text-sm text-brand">
          Try again
        </Button>
      </div>
    </div>
  )
}
