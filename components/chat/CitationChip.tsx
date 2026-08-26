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

  // Spec 12 Decision 5: source_title was already captured in the schema
  // since Spec 05 but never surfaced anywhere — every chip for a WHO source
  // displayed identically as "WHO" with no way to tell which fact sheet.
  // A native title attribute fixes disambiguation without changing the
  // compact visual spec (still just source_name + icon shown inline).
  if (!citation.source_url) {
    return (
      <span className={className} title={citation.source_title}>
        {content}
      </span>
    )
  }

  return (
    <a
      href={citation.source_url}
      target="_blank"
      rel="noopener noreferrer"
      title={citation.source_title}
      className={`${className} hover:bg-safe/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe/50`}
    >
      {content}
    </a>
  )
}
