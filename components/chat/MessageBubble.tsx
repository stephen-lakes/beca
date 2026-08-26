import { CitationChip } from "./CitationChip"
import type { ChatResponse } from "@/lib/ai/schema"

// Three variants per ui-context.md: user, assistant (grounded answer),
// no-grounded-information. The assistant variant isn't a separate prop —
// it's derived from response.grounded (context/specs/07-chat-ui-shell.md
// Decision 5) so this component can never disagree with the data it's
// given. Escalation is never rendered here — see EscalationCard.tsx.
type MessageBubbleProps = { role: "user"; text: string } | ({ role: "assistant" } & ChatResponse)

export function MessageBubble(props: MessageBubbleProps) {
  if (props.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-brand px-4 py-2.5 text-sm text-primary-foreground">
          {props.text}
        </div>
      </div>
    )
  }

  const { grounded, answer, citations } = props

  return (
    <div className="flex justify-start">
      <div
        className={
          grounded
            ? "max-w-[80%] rounded-2xl border border-line bg-card px-4 py-2.5 text-sm text-ink"
            : "max-w-[80%] rounded-2xl border border-dashed border-line bg-paper px-4 py-2.5 text-sm text-ink-soft italic"
        }
      >
        <p>{answer}</p>
        {grounded && citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {citations.map((citation) => (
              <CitationChip key={citation.chunk_id} citation={citation} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
