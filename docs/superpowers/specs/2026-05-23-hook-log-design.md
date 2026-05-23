# AgentFence: Hook Activity Log Design

**Date:** 2026-05-23  
**Status:** Approved — ready for implementation

---

## Problem

AgentFence fires PreToolUse hooks before every Write/Edit/Read operation in Claude Code, but the developer has no way to see what happened across a session or over time. The protection is invisible — there's no answer to "did AgentFence do anything today?" This makes the product feel inert even when it's actively protecting.

---

## Goal

Give developers a single command — `agentfence hook-log` — that shows them exactly what AgentFence protected them from, including a 30-day summary that makes the protection tangible and shareable.

---

## Architecture

### Storage: single append-only NDJSON file

**Location:** `.agentfence/events.ndjson` (inside the project, gitignored)

Every hook invocation appends exactly one JSON line. The file is never locked for reads during writes. Writes are append-only — no read-modify-write, no race conditions even when Claude Code fires multiple hooks in parallel.

**Why NDJSON over daily files / SQLite:**
- One file = no file proliferation, no rotation logic, no user confusion
- Append-only = safe for concurrent writes (no locking)
- Human-readable: `tail -20 .agentfence/events.ndjson` works without tooling
- No native dependencies (SQLite requires node-gyp)
- Future-proof: file format is portable — a future team sync feature just uploads it

**Lazy pruning:** When `agentfence hook-log` reads the file, it filters out entries older than 90 days in memory. If more than 10% of entries were pruned, it rewrites the file asynchronously (non-blocking). The file stays at ~2–3MB steady state automatically with no user intervention.

**Steady-state size estimate:** 100 events/day × 300 bytes × 90 days = ~2.7MB. After two years of heavy use without any pruning: ~21MB. With lazy pruning: stays under 3MB.

---

## Data Model

```typescript
export interface HookLogEntry {
  ts: string;          // ISO 8601 — "2026-05-23T09:14:32.411Z"
  tool: "Write" | "Edit" | "Read";
  filePath: string;    // full path as passed by Claude Code
  outcome: "clean" | "advisory" | "ask" | "denied" | "exception";
  tier?: "advisory" | "high" | "critical";  // set when a path rule matched
  ruleId?: string;     // e.g. "sensitive-env-file", "token-leakage"
}
```

**Outcome values:**

| Outcome | Meaning |
|---|---|
| `clean` | No rule matched — silent allow |
| `advisory` | Path rule matched at advisory tier — additionalContext sent to Claude |
| `ask` | Path rule matched at high/critical tier — ask dialog shown to developer |
| `denied` | Content policy violation — permissionDecision:"deny" sent |
| `exception` | Policy exception matched — silent bypass, no dialog |

`decision` (whether the user clicked Allow or Deny on an ask dialog) is NOT recorded in v1 — Claude Code does not pass the user's decision back to the hook. This is a future enhancement.

---

## `check --hook-input` changes

In `runHookInputCheck`, after determining the outcome and before `process.exit(0)`, call:

```typescript
await appendHookLogEntry(filePath, toolName, outcome, tier?, ruleId?);
```

This call must be wrapped in a `try/catch` that swallows all errors. A logging failure must never block a hook invocation or change its exit code.

The `filePath` stored is the raw value from `tool_input.file_path` — not resolved to absolute. This preserves what Claude Code actually sent.

---

## `agentfence hook-log` command

### Options

```
agentfence hook-log [options]

  --days <n>     show last N days of events (default: 2 — today + yesterday)
  --summary      print only the 30-day summary stats, no event list
  --json         emit raw NDJSON lines to stdout (for piping / scripting)
  --prune        manually remove entries older than 90 days and exit
```

### Terminal output format

```
AgentFence Activity Log

Today  (2026-05-23)
─────────────────────────────────────────────────────────────
  09:14  ℹ  Read   .env.local          warned Claude about secrets
  09:14  ⚠  Edit   .env.local          ask dialog shown
  09:22  ✓  Write  src/index.ts        clean
  09:45  🛡  Write  config.ts           BLOCKED — token-leakage
  09:51  ⚪  Edit   .env.local          bypassed (policy exception)

Yesterday  (2026-05-22)
─────────────────────────────────────────────────────────────
  16:33  ⚠  Write  .env.production     ask dialog shown
  14:12  🛡  Edit   config.ts           BLOCKED — token-leakage

Last 30 days
─────────────────────────────────────────────────────────────
  127 total  ·  8 blocked  ·  23 asks  ·  41 advisories  ·  55 clean
```

**Icons:**

| Icon | Outcome |
|---|---|
| `✓` | clean |
| `ℹ` | advisory |
| `⚠` | ask |
| `🛡` | denied |
| `⚪` | exception |

**filePath display:** show only the basename + one parent directory (e.g. `src/index.ts`, `.env.local`) to keep lines readable. Full path shown in `--json` mode.

**No-events case:** if no events exist for a day, that day's section is omitted. If the entire log is empty, print: `No activity recorded yet. AgentFence hooks will log here automatically.`

**Session grouping** (display only, no storage change): events with a gap >30 minutes from the previous event are displayed with a thin separator line. This gives a natural "session" feel without requiring session IDs.

---

## Files to Create/Modify

| File | Change |
|---|---|
| `src/types/index.ts` | Add `HookLogEntry` interface |
| `src/core/hook-log/index.ts` | **NEW** — `appendHookLogEntry()`, `readHookLog()`, `hookLogPath()` |
| `src/cli/commands/check.ts` | Call `appendHookLogEntry()` before each exit in `runHookInputCheck` |
| `src/cli/commands/hook-log.ts` | **NEW** — `hookLogCommand()` with terminal renderer |
| `src/cli/index.ts` | Register `hook-log` command |
| `tests/core/hook-log.test.ts` | **NEW** — unit tests: append, read, prune, path logic |
| `tests/cli/hook-log.test.ts` | **NEW** — CLI integration tests via spawnSync |

---

## Core module API

```typescript
// src/core/hook-log/index.ts

export function hookLogPath(root?: string): string
// Returns: <root>/.agentfence/events.ndjson
// root defaults to process.cwd()

export async function appendHookLogEntry(
  filePath: string,
  tool: HookTool,
  outcome: HookLogEntry["outcome"],
  tier?: HookLogEntry["tier"],
  ruleId?: string
): Promise<void>
// Appends one NDJSON line. Creates dir/file if missing. Never throws.

export async function readHookLog(
  root?: string,
  opts?: { since?: Date; prune?: boolean }
): Promise<HookLogEntry[]>
// Returns entries sorted oldest-first.
// If prune:true and >10% were pruned, rewrites file in background.
```

---

## Error handling

- **Append fails** (disk full, permissions): swallow silently — hook behavior unchanged
- **Log file missing**: `readHookLog` returns `[]` — not an error
- **Corrupted NDJSON line**: skip that line, continue reading
- **Prune rewrite fails**: swallow silently — stale entries are harmless

---

## Future extensions (not in scope for v1)

- `agentfence status` — calls `readHookLog({ since: today })` and shows last 5 events inline
- Session end detection via PostToolUse or Claude Code session hooks (when available)
- `decision` field — if Claude Code ever passes user allow/deny back to hooks
- Team sync — upload `events.ndjson` to a shared endpoint for cross-developer visibility

---

## Self-Review

**Placeholder scan:** No TBDs. All API signatures are complete. Output format is fully specified.

**Internal consistency:** `appendHookLogEntry` is called from `check.ts` which already knows `outcome`, `tier`, `ruleId` — no new computation needed. `readHookLog` is the only consumer of the file format — schema is defined in one place (`HookLogEntry`).

**Scope check:** Focused. One new file, one modified file, one new command. No regressions to existing scenario/run/report system.

**Ambiguity check:** `filePath` in the log is the raw value from Claude Code (not resolved). The display truncates to basename + one parent. Both behaviors are explicit.
