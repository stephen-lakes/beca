import { HelpCircle } from "lucide-react"

import type { ClarificationResponse } from "@/lib/ai/schema"

// Distinct from both a normal answer bubble and EscalationCard — app-flow.md
// state 6 ("rendered distinctly from both"). Bubble-width, not full-width
// like EscalationCard, and a soft `brand` teal treatment instead of `urgent`
// red: this state carries no safety alarm, and ui-context.md's "unmistakable
// visual break" language is reserved for escalation alone. role="status"
// (not EscalationCard's role="alert") for the same reason — a polite, not
// assertive, live-region announcement. See
// context/specs/18-triage-clarification-ui.md Decisions 1–2.
export function ClarificationCard({ response }: { response: ClarificationResponse }) {
  const { questions } = response

  return (
    <div className="flex justify-start">
      <div
        role="status"
        className="max-w-[80%] rounded-2xl border border-brand bg-brand/5 px-4 py-2.5 text-sm text-ink"
      >
        <div className="flex items-center gap-1.5 text-brand">
          <HelpCircle className="size-4 shrink-0" aria-hidden="true" />
          <p className="font-medium">A couple of quick questions</p>
        </div>
        <ul className="mt-1.5 space-y-1">
          {questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
