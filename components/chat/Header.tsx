// Minimal app-identity header — closes the branding gap flagged while
// drafting context/specs/12-demo-polish-pass.md Decision 1: app-flow.md's
// screen list never mentioned a header, and until this spec nothing but the
// browser tab title identified the app on screen. Rendered as
// ChatThread.tsx's first flex item, bookending DisclaimerBar's position as
// the last one (border-b mirrors DisclaimerBar's border-t). Reuses the
// already-imported Geist Sans at a heavier weight rather than importing a
// second font family, per ui-context.md's Typography section ("not required
// to ship") — no new font import for this final polish unit.
export function Header() {
  return (
    <header className="border-b border-line px-4 py-3">
      <p className="text-sm font-semibold tracking-wide text-ink">Grounded Navigator</p>
    </header>
  )
}
