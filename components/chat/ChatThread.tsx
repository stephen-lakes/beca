"use client"

import { useState, type FormEvent } from "react"
import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MessageBubble } from "./MessageBubble"
import { EscalationCard } from "./EscalationCard"
import { ClarificationCard } from "./ClarificationCard"
import { ServiceResultsCard } from "./ServiceResultsCard"
import { EmptyState } from "./EmptyState"
import { ErrorState } from "./ErrorState"
import { DisclaimerBar } from "./DisclaimerBar"
import { Header } from "./Header"
import {
  ChatResponseSchema,
  EscalationResponseSchema,
  ClarificationResponseSchema,
  ServiceNavigationResponseSchema,
  type ChatResponse,
  type EscalationResponse,
  type ClarificationResponse,
  type ServiceNavigationResponse,
  type PriorClarification,
} from "@/lib/ai/schema"

// Moved here from the now-deleted components/chat/mock-data.ts (Spec 08
// Decision 3) — this is its only consumer now that the mock fixtures are
// gone, so it no longer earns its own file per code-standards.md's
// single-purpose-module principle. Spec 18: gained a third assistant member,
// ClarificationResponse — all three assistant shapes now carry
// needs_clarification as a distinct literal (Spec 17), so the per-turn
// render branch below narrows on it directly, the same way it already
// narrows on escalated. 2026-08-28: gained a fourth assistant member,
// ServiceNavigationResponse (context/specs/20-capability-router-and-navigation.md)
// — distinguished by its own service_navigation: true literal, checked after
// escalated/needs_clarification, same pattern.
type ChatTurn =
  | { role: "user"; text: string }
  | ({ role: "assistant" } & ChatResponse)
  | ({ role: "assistant" } & EscalationResponse)
  | ({ role: "assistant" } & ClarificationResponse)
  | ({ role: "assistant" } & ServiceNavigationResponse)

// Spec 18 Decision 7: derives the follow-up context from the thread's own
// state rather than any new persistence — the server is still fully
// stateless (Spec 17 Decision 1), this just supplies back what the client
// already rendered. Only ever meaningful when called with the messages array
// as it stood immediately before a new user turn is appended (see handleSubmit)
// — this component's own invariant is that every assistant append is
// preceded by exactly one new user append, never two consecutive assistant
// turns, so the entry before a trailing clarification turn is guaranteed to
// be the user message that triggered it.
function getPriorClarification(messages: ChatTurn[]): PriorClarification | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant" || !last.needs_clarification) {
    return null
  }

  const precedingUser = messages[messages.length - 2]
  if (!precedingUser || precedingUser.role !== "user") {
    // Shouldn't happen given the invariant above — handled explicitly rather
    // than assumed, same defensive style as app/api/chat/route.ts's
    // "unreachable in practice" category/severity guard (Spec 06 Decision 9).
    return null
  }

  return { originalMessage: precedingUser.text, questionsAsked: last.questions }
}

// A single global slot, not a per-turn field (Spec 08 Decision 7) — this app
// only ever has one request in flight at a time (see Decision 9 below).
type RequestStatus = { kind: "idle" } | { kind: "pending" } | { kind: "error"; message: string }

// Shown only when the response body itself couldn't be read as JSON at all
// (a network-level failure, an infra error, fetch rejecting outright) — the
// non-ok-but-valid-JSON case instead surfaces the server's own safe `error`
// string. See Spec 08 Decision 10. Not added to lib/ai/schema.ts: that
// file's fixed-copy constants are strings the *server* can return in a
// response body; this one is never sent over the wire.
const REQUEST_FAILED_MESSAGE = "Something went wrong. Please try again."

// The one 'use client' component in this spec — it owns the only state
// (message list, input value, request status) — per code-standards.md's
// "'use client' only on components that need interactivity" and
// context/specs/07-chat-ui-shell.md Decision 3. MessageBubble,
// CitationChip, and EscalationCard stay pure presentational components.
export function ChatThread() {
  // Starts empty (Spec 08 Decision 4) — the seeded mock turns are gone.
  // Spec 10 owns the zero-message empty-state placeholder; this spec
  // deliberately leaves that gap rather than patching it here.
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [inputValue, setInputValue] = useState("")
  const [status, setStatus] = useState<RequestStatus>({ kind: "idle" })
  // Spec 10 Decision 8: the last submitted message, so "Try again" can
  // resend it without the user retyping and without appending a second
  // user bubble (the original one is already visible from the optimistic
  // append in handleSubmit).
  const [lastMessage, setLastMessage] = useState("")
  // Spec 18 Decision 8: stored alongside lastMessage, for the same reason —
  // getPriorClarification() can only be correctly computed from `messages`
  // *before* the new user turn is optimistically appended, but the retry
  // button below calls requestAnswer again after that append already
  // happened. Recomputing it at retry time would silently lose the
  // clarification context on exactly the turn where losing it matters most.
  const [lastPriorClarification, setLastPriorClarification] = useState<PriorClarification | null>(null)

  // Spec 10 Decision 8: extracted out of handleSubmit so both the form
  // submit and ErrorState's retry button share the exact same fetch/
  // validate/append-or-error logic (Spec 08) instead of duplicating it.
  // Spec 18 Decision 9: gained a second parameter, threaded straight into
  // the POST body — Spec 17's ChatRequestSchema already accepts this field
  // as nullable().optional(), so sending an explicit null on every
  // non-clarification turn is valid and simplest.
  async function requestAnswer(message: string, priorClarification: PriorClarification | null) {
    setStatus({ kind: "pending" })

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, priorClarification }),
      })

      if (!res.ok) {
        // app/api/chat/route.ts never returns anything in `error` except its
        // own pre-written safe strings — never a raw exception — so this is
        // safe to show verbatim per Spec 08 Decision 10.
        const body = await res.json().catch(() => null)
        const errorMessage = typeof body?.error === "string" ? body.error : REQUEST_FAILED_MESSAGE
        setStatus({ kind: "error", message: errorMessage })
        return
      }

      const json = await res.json().catch(() => null)
      if (json === null) {
        setStatus({ kind: "error", message: REQUEST_FAILED_MESSAGE })
        return
      }

      // Re-validate client-side rather than trusting `escalated` alone
      // (Spec 08 Decision 11) — the server already validated the same
      // shapes before sending (Spec 06); this is cheap extra insurance at
      // the client boundary, in the same spirit as Spec 06's own
      // route-level `.parse()` calls on hand-constructed objects. Spec 18
      // Decision 5: extended from a 2-way to a 3-way check, same
      // discriminant order lib/ai/schema.ts documents (escalated first,
      // then needs_clarification). 2026-08-28: extended to a 4-way check —
      // service_navigation checked last, before falling to the default
      // ChatResponse shape, same discriminant order lib/ai/schema.ts
      // documents for it.
      const parsed = json.escalated
        ? EscalationResponseSchema.safeParse(json)
        : json.needs_clarification
          ? ClarificationResponseSchema.safeParse(json)
          : json.service_navigation
            ? ServiceNavigationResponseSchema.safeParse(json)
            : ChatResponseSchema.safeParse(json)

      if (!parsed.success) {
        console.error("Received a response that failed client-side re-validation:", json, parsed.error)
        setStatus({ kind: "error", message: REQUEST_FAILED_MESSAGE })
        return
      }

      setMessages((prev) => [...prev, { role: "assistant", ...parsed.data } as ChatTurn])
      setStatus({ kind: "idle" })
    } catch (error) {
      console.error("POST /api/chat failed:", error)
      setStatus({ kind: "error", message: REQUEST_FAILED_MESSAGE })
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = inputValue.trim()
    // Empty-string guard (unchanged from Spec 07) plus a pending guard
    // (Spec 08 Decision 9) — defense-in-depth against an Enter-key submit
    // racing the disabled-prop update on the input/button.
    if (!trimmed || status.kind === "pending") return

    // Spec 18 Decision 7: computed from `messages` as it stands right now —
    // before the new user turn below is appended, per getPriorClarification's
    // own contract.
    const priorClarification = getPriorClarification(messages)

    setMessages((prev) => [...prev, { role: "user", text: trimmed }])
    setLastMessage(trimmed)
    setLastPriorClarification(priorClarification)
    setInputValue("")
    await requestAnswer(trimmed, priorClarification)
  }

  return (
    // h-full (was min-h-0 flex-1 with no height cap) — pairs with
    // layout.tsx's body now being h-dvh/overflow-hidden instead of
    // min-h-full: previously the body had no height ceiling, so once the
    // message thread grew the whole page grew past the viewport and the
    // *page* scrolled, taking Header and the input form with it. Now this
    // component is handed a fixed-height box by the body and is the one
    // that must not overflow it; min-h-0 stays required so the flex-1
    // thread below can still shrink and become the sole scroll container
    // instead of stretching this box past its parent's fixed height.
    <div className="flex h-full min-h-0 flex-col bg-paper">
      {/* Spec 12 Decision 1: bookends DisclaimerBar's position as the last
          flex item — one component (this one) owns the full screen's
          layout, extending Spec 07 Decision 3's principle. */}
      <Header />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        {/* mx-auto max-w-3xl (project-owner polish pass, post-Spec-12) —
            caps the message column at a readable width instead of letting
            MessageBubble's max-w-[80%] stretch to 80% of a full laptop-width
            viewport. Same column width Header.tsx, the input form below, and
            DisclaimerBar.tsx all now share. h-full lets EmptyState's own
            h-full still resolve to this scroll container's real height, not
            just its own intrinsic content height. gap-4 replaces the old
            space-y-4 now that it lives on this inner wrapper instead of the
            scroll container itself. */}
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4">
          {/* Spec 10 Decision 5: closes the blank-screen gap Spec 08 Decision 4
              deliberately left open. */}
          {messages.length === 0 && <EmptyState />}

          {messages.map((turn, index) =>
            turn.role === "user" ? (
              <MessageBubble key={index} role="user" text={turn.text} />
            ) : turn.escalated ? (
              <EscalationCard key={index} response={turn} />
            ) : turn.needs_clarification ? (
              // Spec 18 Decision 4: escalated checked first, then
              // needs_clarification — the two are mutually exclusive by
              // construction (lib/ai/schema.ts), matching the discriminant
              // order Spec 17 documented for the API response shapes.
              <ClarificationCard key={index} response={turn} />
            ) : turn.service_navigation ? (
              // 2026-08-28: same pattern, checked last before the default
              // ChatResponse bubble — the four assistant shapes are mutually
              // exclusive by construction (lib/ai/schema.ts).
              <ServiceResultsCard key={index} response={turn} />
            ) : (
              <MessageBubble key={index} {...turn} />
            )
          )}

          {/* Trailing pending/error slot (Spec 08 Decisions 7, 8, 10) — never
              stored inside a ChatTurn itself. aria-live announces it without a
              manual focus move. The pending branch is untouched by Spec 10
              (loading-state polish is explicitly Spec 12's job); the error
              branch now renders the dedicated ErrorState component instead of
              a bare <p> (Spec 10 Decision 6). */}
          {status.kind !== "idle" && (
            <div aria-live="polite" className="px-1">
              {status.kind === "pending" && <p className="text-sm text-ink-soft">Thinking…</p>}
              {status.kind === "error" && (
                <ErrorState
                  message={status.message}
                  onRetry={() => requestAnswer(lastMessage, lastPriorClarification)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Project-owner polish pass (post-Spec-12): previously a plain
          full-width bar — border-t, edge-to-edge Input+Button row — which on
          a laptop-width viewport read as an oversized, un-premium input
          spanning the whole browser width. Now a two-layer treatment: the
          outer band still spans full width (paper background, so it reads
          as part of the page rather than a floating overlay), but the form
          itself is capped at the same max-w-3xl column as the rest of the
          app and rendered as a single rounded, bordered, shadowed pill —
          Input and Button as one visual unit instead of two separate
          bordered controls sitting side by side. */}
      <div className="border-t border-line bg-paper px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-3xl items-center gap-1.5 rounded-2xl border border-line bg-card px-2 py-1.5 shadow-sm transition-colors focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15"
        >
          {/* Border/shadow/ring stripped at the call site so the pill
              wrapper above supplies the one visible boundary, not editing
              the generated Input primitive (architecture.md: "do not
              hand-edit generated files"), same precedent Spec 07 Decision 9
              set for Button's min-h-11/min-w-11 override below. */}
          <Input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Ask a health question..."
            aria-label="Message"
            maxLength={2000}
            disabled={status.kind === "pending"}
            className="min-h-11 border-none bg-transparent shadow-none focus-visible:ring-0"
          />
          {/* min-h-11/min-w-11 = 44px, the ui-context.md touch-target minimum
              — applied at the call site rather than editing the generated
              Button primitive (architecture.md: "do not hand-edit generated
              files"). See context/specs/07-chat-ui-shell.md Decision 9. */}
          <Button
            type="submit"
            disabled={status.kind === "pending"}
            className="min-h-11 min-w-11 shrink-0 rounded-xl"
            aria-label="Send message"
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>

      {/* Spec 10 Decisions 1–3: persistent across every state (empty,
          populated, pending, error) since it's outside the conditional
          blocks above. */}
      <DisclaimerBar />
    </div>
  )
}
