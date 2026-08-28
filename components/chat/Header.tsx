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
// Content wrapped in the same mx-auto max-w-3xl column ChatThread.tsx's
// message thread, input, and DisclaimerBar all share (project-owner polish
// pass, post-Spec-12) — on a wide/laptop viewport the header bar itself
// still spans full width (its border reads as a full page-width rule, same
// as before), but the content aligns to the same column as the rest of the
// app's content instead of sitting flush at the browser edge alone.
//
// 2026-08-28: gained a second line, the app's descriptive title, on
// explicit project-owner request. "Beca" above is a wordmark (a proper
// noun, no descriptive value to a screen reader on its own), not a heading
// — it stays a plain <p>. The app previously had zero headings anywhere
// (confirmed by repo-wide grep before adding this one), so this <h1> is
// safe to add as the page's sole heading without creating a heading-level
// conflict. Centered (not left-aligned) at every breakpoint, not just
// desktop — simplest way to satisfy "centered on large screens" without a
// breakpoint-specific alignment flip, and it reads cleanly stacked under
// the wordmark on narrow screens too. Sized down from the wordmark and
// scaled up across breakpoints (text-sm -> sm:text-base -> md:text-lg) so
// it stays legible and prominent without visually outcompeting the brand
// mark above it. No fixed height/nowrap — the two-line header is still
// inside ChatThread.tsx's h-full/min-h-0 flex column, so it simply takes
// the height it needs and the message thread (flex-1 min-h-0) absorbs the
// difference, same as before; text wraps normally at very narrow widths
// rather than being forced onto one line.
export function Header() {
  return (
    <header className="border-b border-line px-4 py-3 sm:py-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-0.5 text-center">
        <p className="text-xl font-heading font-bold uppercase tracking-wide text-ink">
          Beca
        </p>
        <h1 className="text-sm font-medium text-ink sm:text-base md:text-lg">
          AI Healthcare Information Assistant
        </h1>
      </div>
    </header>
  )
}
