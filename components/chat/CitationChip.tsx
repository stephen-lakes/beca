import { ExternalLink } from "lucide-react"

import type { Citation } from "@/lib/ai/schema"

// Small, safe-colored, shows the source name and an external-link icon —
// ui-context.md's Citation chip spec, verbatim. Renders as a link only when
// source_url is non-null (internally authored content has no URL to link
// to, per database-schema.md's kb_sources.source_url being nullable).
export function CitationChip({ citation }: { citation: Citation }) {
  const content = (
    <>
      <span>{citation.source_name}</span>
      {citation.source_url && <ExternalLink className="size-3" aria-hidden="true" />}
    </>
  )

  const className =
    "inline-flex items-center gap-1 rounded-full border border-safe/30 bg-safe/10 px-2.5 py-1 text-xs font-medium text-safe"

  if (!citation.source_url) {
    return <span className={className}>{content}</span>
  }

  return (
    <a
      href={citation.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} hover:bg-safe/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe/50`}
    >
      {content}
    </a>
  )
}
