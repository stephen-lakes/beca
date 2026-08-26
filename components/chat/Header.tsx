// Minimal app-identity header — closes the branding gap flagged while
// drafting context/specs/12-demo-polish-pass.md Decision 1: app-flow.md's
// screen list never mentioned a header, and until this spec nothing but the
// browser tab title identified the app on screen. Rendered as
// ChatThread.tsx's first flex item, bookending DisclaimerBar's position as
// the last one (border-b mirrors DisclaimerBar's border-t).
//
// Wordmark now set in the `font-heading` display face (Big Shoulders
// Display), not the body face — Spec 12 originally decided against a second
// font import here; reopened at the project owner's direction post-MVP, see
// ui-context.md's Typography section and progress-tracker.md's Architecture
// Decisions. Sized up and set in caps so the condensed face reads as a
// wordmark rather than dense body copy at header scale.
export function Header() {
  return (
    <header className="border-b border-line px-4 py-3">
      <p className="text-xl font-heading font-bold uppercase tracking-wide text-ink">
        Beca
      </p>
    </header>
  )
}
