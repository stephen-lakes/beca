# Agent Context — Alias

This file exists only so any agent that looks for `AGENTS.md` instead of `CLAUDE.md` finds the same instructions rather than starting from zero.

Read [`CLAUDE.md`](./CLAUDE.md) and follow it exactly. Do not maintain separate content here — if the read order or rules ever change, edit `CLAUDE.md` only.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
