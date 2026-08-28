import type { Metadata } from "next";
import { Public_Sans, Big_Shoulders, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Body/UI face — replaces Geist Sans. Variable named `--font-sans` directly
// (not `--font-geist-sans`) so it's read live by `@theme inline`'s
// `--font-sans: var(--font-sans)` in globals.css, per Next.js's own
// documented next/font + Tailwind v4 pattern. The previous Geist wiring used
// a mismatched variable name (`--font-geist-sans`) that `--font-sans` never
// referenced anywhere — Geist was never actually applied by the `font-sans`
// utility; found while wiring this font system, fixed here, not carried
// forward.
const publicSans = Public_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Display/heading face — reopens Spec 12's "no second font" decision, at the
// project owner's explicit direction after reviewing a side-by-side
// comparison. Scoped to the header only per ui-context.md's Typography
// section; body copy stays on Public Sans. This installed next/font/google
// version has no separate `Big_Shoulders_Display` export — Google's several
// Big Shoulders widths/optical sizes are exposed here as one `Big_Shoulders`
// family with an `opsz` axis instead, so that's what's requested. `axes`
// requires `weight: "variable"` (a fixed weight array errors at build time),
// so the header component's own `font-bold` utility supplies the actual
// weight from within the font's variable range.
const bigShouldersDisplay = Big_Shoulders({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
});

// Mono face — replaces Geist Mono. Same live-cascade wiring as `--font-sans`
// above.
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Beca",
  description: "Grounded health information and service navigation for Lagos, Nigeria.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${bigShouldersDisplay.variable} ${plexMono.variable} h-full antialiased`}
    >
      {/* h-dvh + overflow-hidden locks the app to exactly one viewport-height
          screen with no page-level scroll — previously min-h-full let the
          body grow taller than the viewport whenever content overflowed, so
          the whole page (including Header and the input form) scrolled
          along with the message thread instead of staying fixed. Fixed at
          the project owner's direction; see ui-context.md and
          ChatThread.tsx's matching h-full on its own root. */}
      <body className="h-dvh flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
