import type { ConversationalResponse } from "@/lib/ai/schema"

// Renders ConversationalResponseSchema (Spec 25) — greeting, farewell,
// thanks, help_request, general_conversation, out_of_scope. Deliberately its
// own small component, not a MessageBubble variant, following the exact
// precedent ClarificationCard/ServiceResultsCard already set ("a state with
// its own meaning gets its own component"): MessageBubble is typed tightly
// against ChatResponse (Spec 07 Decision 5 — "derived from response.grounded
// so this component can never disagree with the data it's given") and has no
// grounded/citations/simple_version/pidgin_version fields to key off here —
// ConversationalResponseSchema deliberately carries none of those (Spec 25
// Decision 4). Styled like a successful, plain answer bubble — solid border,
// not MessageBubble's dashed/italic "we don't know" treatment for
// grounded: false — since a greeting or thank-you is a successful
// interaction, not a refusal. See
// context/specs/26-conversational-intents-ui.md.
export function ConversationalReplyBubble({ response }: { response: ConversationalResponse }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl border border-line bg-card px-4 py-2.5 text-sm text-ink">
        <p>{response.message}</p>
      </div>
    </div>
  )
}
