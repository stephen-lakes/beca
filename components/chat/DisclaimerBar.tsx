// Persistent across every screen state (ui-context.md), rendered as
// ChatThread.tsx's final flex item — a "thin top border" only reads as a
// separator from something above it (the input form), not from nothing at
// the very top of the page. See context/specs/10-disclaimer-privacy-error-empty-states.md
// Decision 1. One component carries both the disclaimer and the privacy
// notice (Decision 2) — project-overview.md lists them as a single
// Must-Have bullet, not two. English only — no Simple/Pidgin toggle here,
// same fixed-safety-copy reasoning Spec 09 used to exclude the escalation
// card (Decision 4, tracked as an Open Question, not decided as "never").
export function DisclaimerBar() {
  return (
    <div className="border-t border-line px-4 py-2 text-center text-xs text-ink-soft">
      <p>This is general health information, not a diagnosis or treatment plan. Always see a qualified health worker for anything specific to you.</p>
      <p>No login. Nothing you type is saved after this session.</p>
    </div>
  )
}
