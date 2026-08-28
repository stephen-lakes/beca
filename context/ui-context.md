# UI Context

## Aesthetic direction

Calm, clinical, trustworthy — closer to a well-designed public health-service website than a generic chatbot toy. Generous whitespace, legible type, and an unmistakable visual break for the escalation state, since that state is the single highest-value asset in the build.

## Color tokens

This project uses Tailwind CSS v4 (CSS-first config, no `tailwind.config.ts`). Add these as CSS custom properties plus `@theme` entries in `app/globals.css`, alongside the existing shadcn theme variables. No raw hex values appear anywhere outside `app/globals.css`.

| Token | Hex | Usage |
|---|---|---|
| `paper` | `#F2F5F1` | App background |
| `ink` | `#182420` | Primary text |
| `ink-soft` | `#4E5C56` | Secondary text |
| `line` | `#D8E0DA` | Borders, dividers |
| `brand` | `#1F6F6B` | Interactive elements, links, primary buttons |
| `urgent` | `#B8452F` | Escalation card only — never used for anything else |
| `urgent-soft` | `#F5DBD2` | Escalation card background |
| `safe` | `#3C8A5A` | Citation / verified-source indicators |

> Named `brand`, not `accent`: shadcn/ui already reserves `--accent` for its own neutral hover-background token used inside generated primitives (buttons, menus, etc.). Reusing that name would silently override or be overridden by shadcn's value. Use `bg-brand` / `text-brand` / `border-brand` for this app's teal interactive color.

Dark-mode equivalents are not required for the MVP demo; add them only if polish time (H16–19) allows.

## Typography

Three Google Fonts, loaded via `next/font/google` in `app/layout.tsx` and exposed as Tailwind utilities through `app/globals.css`'s `@theme inline` block — no raw font-family values in components, same rule as color tokens.

| Role | Font | Tailwind utility | Usage |
|---|---|---|---|
| Body / UI | Public Sans | `font-sans` (default) | All message text, labels, buttons, disclaimer bar — everything except the header wordmark |
| Display / heading | Big Shoulders (`opsz` axis, Display range) | `font-heading` | Header wordmark only — condensed and bold, so scope it narrowly rather than letting it spread into body copy |
| Mono | IBM Plex Mono | `font-mono` | Reserved for tabular/code-like content (e.g. a future timestamp or id) — nothing currently renders with it |

Replaced Geist Sans/Geist Mono post-MVP, at the project owner's explicit direction, after reviewing a side-by-side mockup comparison. See `progress-tracker.md`'s Architecture Decisions for the full rationale, including a real variable-naming bug this change caught and fixed (Geist Sans was never actually wired into the `font-sans` utility).

## Spacing

Tailwind's default spacing scale (4px base unit). No custom scale is needed at this size of app.

## Component specs

- **Header** — app name only, persistent at the top of the screen, `ink` text on `paper`, thin bottom border, wordmark in `font-heading` (Big Shoulders Display, bold, uppercase).
- **Message bubble** — three variants: user, assistant (grounded answer), no-grounded-information.
- **Citation chip** — small, `safe`-colored, shows the source name and an external-link icon.
- **Escalation card** — full width, `urgent` top border, `urgent-soft` background, always includes the disclaimer line inline (not just in the global bar).
- **Clarification card** (Spec 18) — bubble-width, not full-width like the escalation card: this state carries no safety alarm, and the "unmistakable visual break" language above is reserved for escalation alone. `brand` border, soft `brand`-tinted background (`bg-brand/5`), a `HelpCircle` icon plus a short label ("A couple of quick questions"), then 1–2 questions listed below. `role="status"`, not `role="alert"` — a polite, not assertive, live-region announcement. Never rendered as a plain answer bubble or as the escalation card — see `app-flow.md` state 6.
- **Service results card** (Spec 20) — full width like the escalation card (it lists the same kind of directory entries), but calm, not alarming: `brand` top border, soft `brand`-tinted background, a `MapPin` icon, `role="status"` not `role="alert"`. Renders matched facilities the same way the escalation card renders `matched_entries` (name / area / contact / unconfirmed qualifier), or an honest "not on file yet" message when there are none. Never uses `urgent`/`urgent-soft` — those stay reserved for the escalation card alone. See `app-flow.md` state 7.
- **Toggle (language / reading level)** — shadcn `Toggle` or `Switch`, always labelled, visible active state.
- **Disclaimer bar** — persistent across every screen state, `ink-soft` text, thin top border.

## Accessibility

- Minimum touch target 44×44px on all toggles.
- Color is never the only signal for the escalation state — it also carries a distinct icon and label ("Please seek care").
- Every interactive element has a visible focus state.
