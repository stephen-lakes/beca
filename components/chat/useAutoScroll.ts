import { useCallback, useEffect, useRef, useState } from "react"

// Single-purpose module (code-standards.md): owns only "how/when to
// auto-scroll the message thread," decoupled from ChatTurn/RequestStatus —
// ChatThread.tsx decides *when* content changed and whether that change was
// caused directly by the user (their own submitted message, or the
// "Thinking…" indicator that immediately follows it) vs. an assistant
// response arriving asynchronously; this hook only knows how to act on that
// distinction.
//
// Reasoning for the design (ChatThread.tsx's UX bug report, 2026-08-29):
// - The user's own message and the "Thinking…" indicator should always pull
//   the view down, regardless of where the user was previously scrolled —
//   they just took an action and expect to see its result.
// - An assistant response that finishes while the user has deliberately
//   scrolled up to reread earlier messages should never yank them back down
//   — it should only surface a "Jump to latest" affordance instead.
// - There's no token-level streaming in this app (app/api/chat/route.ts
//   returns one JSON payload, not a stream — see architecture.md), so
//   "follow content as it's generated" collapses to "keep the newest turn
//   in view the moment it's appended," not a per-token scroll loop.

// Distance (px) from the true bottom that still counts as "at the bottom" —
// large enough to absorb a fractional-pixel scroll position or a bubble's
// own padding, small enough that "reading a few messages up" still counts
// as scrolled away.
const NEAR_BOTTOM_THRESHOLD = 120

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function useAutoScroll() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  // Ref, not just state — read synchronously inside notifyContentChanged,
  // which can fire from a render effect before a state update from the
  // scroll listener would have flushed.
  const isNearBottomRef = useRef(true)
  // Drives the "Jump to latest" button — true only once new content has
  // actually arrived while the user was scrolled away.
  const [hasNewContent, setHasNewContent] = useState(false)

  const scrollToBottom = useCallback((force: boolean) => {
    if (!force && !isNearBottomRef.current) return
    endRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "end",
    })
    isNearBottomRef.current = true
    setHasNewContent(false)
  }, [])

  // Call whenever the thread gains new content (a new turn appended, or the
  // pending/error indicator changing). `isOwnAction` marks content that
  // directly followed the user's own action — always follows it — versus
  // content that just arrived on its own, which only follows if the user
  // was already at the bottom.
  const notifyContentChanged = useCallback(
    (isOwnAction: boolean) => {
      if (isOwnAction || isNearBottomRef.current) {
        scrollToBottom(isOwnAction)
      } else {
        setHasNewContent(true)
      }
    },
    [scrollToBottom],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleScroll() {
      if (!container) return
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD
      isNearBottomRef.current = nearBottom
      // The user scrolled back down manually — clear the affordance rather
      // than waiting for the next notifyContentChanged call.
      if (nearBottom) setHasNewContent(false)
    }

    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => container.removeEventListener("scroll", handleScroll)
  }, [])

  return {
    containerRef,
    endRef,
    hasNewContent,
    // Exposed for the "Jump to latest" button's onClick — always a forced,
    // explicit scroll regardless of current position.
    jumpToLatest: () => scrollToBottom(true),
    notifyContentChanged,
  }
}
