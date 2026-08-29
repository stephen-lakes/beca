import { ArrowDown } from "lucide-react"

import { Button } from "@/components/ui/button"

// Pure presentational (no state of its own) — ChatThread.tsx owns the
// hasNewContent flag via useAutoScroll and only mounts this when it's true.
// Floats above the input pill rather than inline in the thread, since its
// entire purpose is to be reachable without the user having scrolled to
// where a normal element would sit.
export function JumpToLatestButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      aria-label="Jump to latest message"
      className="absolute bottom-4 left-1/2 h-auto min-h-11 -translate-x-1/2 gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm text-brand shadow-sm hover:bg-card/90"
    >
      <ArrowDown className="size-3.5" aria-hidden="true" />
      New response
    </Button>
  )
}
