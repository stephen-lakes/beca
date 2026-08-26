import { useState } from "react"

import { CitationChip } from "./CitationChip"
import { ReadingLevelToggle } from "./ReadingLevelToggle"
import { LanguageToggle } from "./LanguageToggle"
import type { ChatResponse } from "@/lib/ai/schema"

// Three variants per ui-context.md: user, assistant (grounded answer),
// no-grounded-information. The assistant variant isn't a separate prop —
// it's derived from response.grounded (context/specs/07-chat-ui-shell.md
// Decision 5) so this component can never disagree with the data it's
// given. Escalation is never rendered here — see EscalationCard.tsx.
type MessageBubbleProps = { role: "user"; text: string } | ({ role: "assistant" } & ChatResponse)

// No separate 'use client' directive needed here (Spec 09 Decision 9) — this
// component is only ever rendered as a descendant of ChatThread.tsx, which
// already declares 'use client' (Spec 07 Decision 3); the client boundary
// starts there, not at every interactive descendant.
export function MessageBubble(props: MessageBubbleProps) {
  // Spec 09: both toggles are independent booleans, local to this bubble
  // instance (Decision 7 — each assistant turn already carries all three
  // text variants, so toggling never needs a new request or global state).
  const [simpleOn, setSimpleOn] = useState(false)
  const [pidginOn, setPidginOn] = useState(false)

  if (props.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-brand px-4 py-2.5 text-sm text-primary-foreground">
          {props.text}
        </div>
      </div>
    )
  }

  const { grounded, answer, citations, simple_version, pidgin_version } = props

  // Decision 8: Pidgin wins when both are on — a documented tie-break, not a
  // fourth "simple Pidgin" variant. Each toggle still reflects its own
  // pressed state independently regardless of which text is displayed.
  const displayedText = pidginOn ? pidgin_version : simpleOn ? simple_version : answer

  // Spec 12 Decision 6: dedupe by source, not chunk_id — a display-layer
  // concern, not a data-integrity one (architecture.md hard invariant 5 is
  // about validating what's cited, not how many chips a compact UI renders
  // for it). If the model cited multiple chunks from the same source page,
  // this renders one chip, not several identical-looking ones.
  const uniqueCitations = citations.filter(
    (citation, index) =>
      citations.findIndex((c) => c.source_title === citation.source_title && c.source_url === citation.source_url) === index,
  )

  return (
    <div className="flex justify-start">
      <div
        className={
          grounded
            ? "max-w-[80%] rounded-2xl border border-line bg-card px-4 py-2.5 text-sm text-ink"
            : "max-w-[80%] rounded-2xl border border-dashed border-line bg-paper px-4 py-2.5 text-sm text-ink-soft italic"
        }
      >
        <p>{displayedText}</p>
        {grounded && uniqueCitations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {uniqueCitations.map((citation) => (
              <CitationChip key={citation.chunk_id} citation={citation} />
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ReadingLevelToggle pressed={simpleOn} onPressedChange={() => setSimpleOn((prev) => !prev)} />
          <LanguageToggle pressed={pidginOn} onPressedChange={() => setPidginOn((prev) => !prev)} />
        </div>
      </div>
    </div>
  )
}
