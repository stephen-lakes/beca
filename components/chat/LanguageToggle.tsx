import { Toggle } from "@/components/ui/toggle"

// Pure presentational, per context/specs/09-plain-language-pidgin-toggles.md
// Decision 11 — the pressed/onPressedChange state lives in the parent
// MessageBubble, not here. 44x44 touch target per ui-context.md's
// unconditional "minimum touch target 44x44px on all toggles" (Decision 12).
export function LanguageToggle({ pressed, onPressedChange }: { pressed: boolean; onPressedChange: () => void }) {
  return (
    <Toggle
      pressed={pressed}
      onPressedChange={onPressedChange}
      aria-label="Show this answer in Nigerian Pidgin"
      className="min-h-11 min-w-11 border border-line text-xs text-ink-soft data-[state=on]:border-brand data-[state=on]:bg-brand/10 data-[state=on]:text-brand"
    >
      Pidgin
    </Toggle>
  )
}
