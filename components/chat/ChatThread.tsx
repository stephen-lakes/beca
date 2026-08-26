"use client"

import { useState, type FormEvent } from "react"
import { Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MessageBubble } from "./MessageBubble"
import { EscalationCard } from "./EscalationCard"
import {
  ChatResponseSchema,
  EscalationResponseSchema,
  type ChatResponse,
  type EscalationResponse,
} from "@/lib/ai/schema"

// Moved here from the now-deleted components/chat/mock-data.ts (Spec 08
// Decision 3) — this is its only consumer now that the mock fixtures are
// gone, so it no longer earns its own file per code-standards.md's
// single-purpose-module principle.
type ChatTurn = { role: "user"; text: string } | ({ role: "assistant" } & ChatResponse) | ({ role: "assistant" } & EscalationResponse)

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = inputValue.trim()
    // Empty-string guard (unchanged from Spec 07) plus a pending guard
    // (Decision 9) — defense-in-depth against an Enter-key submit racing
    // the disabled-prop update on the input/button.
    if (!trimmed || status.kind === "pending") return

    setMessages((prev) => [...prev, { role: "user", text: trimmed }])
    setInputValue("")
    setStatus({ kind: "pending" })

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) {
        // app/api/chat/route.ts never returns anything in `error` except its
        // own pre-written safe strings — never a raw exception — so this is
        // safe to show verbatim per Decision 10.
        const body = await res.json().catch(() => null)
        const message = typeof body?.error === "string" ? body.error : REQUEST_FAILED_MESSAGE
        setStatus({ kind: "error", message })
        return
      }

      const json = await res.json().catch(() => null)
      if (json === null) {
        setStatus({ kind: "error", message: REQUEST_FAILED_MESSAGE })
        return
      }

      // Re-validate client-side rather than trusting `escalated` alone
      // (Decision 11) — the server already validated the same shapes before
      // sending (Spec 06); this is cheap extra insurance at the client
      // boundary, in the same spirit as Spec 06's own route-level `.parse()`
      // calls on hand-constructed objects.
      const parsed = json.escalated ? EscalationResponseSchema.safeParse(json) : ChatResponseSchema.safeParse(json)

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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-paper">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.map((turn, index) =>
          turn.role === "user" ? (
            <MessageBubble key={index} role="user" text={turn.text} />
          ) : turn.escalated ? (
            <EscalationCard key={index} response={turn} />
          ) : (
            <MessageBubble key={index} {...turn} />
          )
        )}

        {/* Trailing pending/error slot (Decisions 7, 8, 10) — never stored
            inside a ChatTurn itself. aria-live announces it without a manual
            focus move. */}
        {status.kind !== "idle" && (
          <div aria-live="polite" className="px-1">
            {status.kind === "pending" && <p className="text-sm text-ink-soft">Thinking…</p>}
            {status.kind === "error" && <p className="text-sm text-ink-soft">{status.message}</p>}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line px-4 py-3">
        <Input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Ask a health question..."
          aria-label="Message"
          maxLength={2000}
          disabled={status.kind === "pending"}
          className="min-h-11"
        />
        {/* min-h-11/min-w-11 = 44px, the ui-context.md touch-target minimum
            — applied at the call site rather than editing the generated
            Button primitive (architecture.md: "do not hand-edit generated
            files"). See context/specs/07-chat-ui-shell.md Decision 9. */}
        <Button
          type="submit"
          disabled={status.kind === "pending"}
          className="min-h-11 min-w-11"
          aria-label="Send message"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  )
}
