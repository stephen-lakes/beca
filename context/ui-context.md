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

The Tailwind default `font-sans` stack is acceptable for MVP speed. If polish time allows, add one distinct display face for the header only — not required to ship.

## Spacing

Tailwind's default spacing scale (4px base unit). No custom scale is needed at this size of app.

## Component specs

- **Header** — app name only, persistent at the top of the screen, `ink` text on `paper`, thin bottom border. No distinct display face shipped for the MVP (Spec 12) — reuses the existing Geist Sans at a heavier weight rather than a second font import.
- **Message bubble** — three variants: user, assistant (grounded answer), no-grounded-information.
- **Citation chip** — small, `safe`-colored, shows the source name and an external-link icon.
- **Escalation card** — full width, `urgent` top border, `urgent-soft` background, always includes the disclaimer line inline (not just in the global bar).
- **Toggle (language / reading level)** — shadcn `Toggle` or `Switch`, always labelled, visible active state.
- **Disclaimer bar** — persistent across every screen state, `ink-soft` text, thin top border.

## Accessibility

- Minimum touch target 44×44px on all toggles.
- Color is never the only signal for the escalation state — it also carries a distinct icon and label ("Please seek care").
- Every interactive element has a visible focus state.
