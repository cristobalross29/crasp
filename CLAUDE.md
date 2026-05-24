# Crasp

Local-first security layer for Claude Code. Intercepts Write, Edit, and Read operations
via PreToolUse hooks, scans content for leaked secrets and policy violations, and keeps a
persistent activity log. Also exposes an MCP server so Claude can self-check before acting.

## Commands

```sh
pnpm build      # compile src/ → dist/ (esm + .d.ts via tsup)
pnpm test       # run Vitest test suite (145 tests)
pnpm typecheck  # tsc --noEmit
pnpm dev        # watch-mode build
```

**Always run `pnpm build && pnpm test && pnpm typecheck` before committing.**

## Architecture and data flows

See `.claude/CLAUDE.md` for the full module map, key data flows (hook pipeline, MCP
server, scenario runner), sensitive path tiers, builtin policy rules, and extension guides.

## Agent collaboration

See `AGENTS.md` for how Claude Code and Codex divide responsibilities, shared workflows
(adding features, authoring scenarios, auditing safety), and model selection guidance.
