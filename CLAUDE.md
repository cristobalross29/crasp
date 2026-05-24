# Crasp

Local-first security layer for Claude Code. Intercepts Write, Edit, and Read operations
via PreToolUse hooks, scans content for leaked secrets and policy violations, and keeps a
persistent activity log. Also exposes an MCP server so Claude can self-check before acting.

## Commands

```sh
pnpm build      # compile src/ → dist/ (esm + .d.ts via tsup)
pnpm test       # run Vitest test suite
pnpm typecheck  # tsc --noEmit
pnpm dev        # watch-mode build
```

**Always run `pnpm build && pnpm test && pnpm typecheck` before committing.**

## Working in this repo

See `AGENTS.md` — it covers project navigation, how Claude Code and Codex divide
responsibilities, shared workflows, and model selection. That is the single source of
truth for all agents working in this codebase.
