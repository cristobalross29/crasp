# Crasp

Local-first security layer for Claude Code. Intercepts every Write/Edit/Read/Bash operation via PreToolUse hooks, scans content for leaked secrets and policy violations, and records a persistent activity log. Also exposes an MCP server so Claude can self-check before acting.

## Commands

```sh
pnpm build      # compile src/ → dist/ (esm + .d.ts via tsup)
pnpm test       # run Vitest test suite
pnpm typecheck  # tsc --noEmit
pnpm dev        # watch-mode build
```

**Always run `pnpm build && pnpm test && pnpm typecheck` before committing.**

CLI (after build):
```sh
node dist/index.js setup                          # wire hooks, MCP, CLAUDE.md into a project
node dist/index.js check --hook-input Write       # evaluate a PreToolUse payload from stdin
node dist/index.js hook-log                       # show today's hook activity
node dist/index.js hook-log --summary             # 30-day stats only
node dist/index.js mcp                            # start MCP server (stdio)
node dist/index.js run <scenario.yml>             # run a scenario transcript
node dist/index.js scan <path>                    # scan files for policy violations
node dist/index.js check --staged                 # scan staged git files
node dist/index.js policy list                    # show active rules
node dist/index.js status                         # verify setup
node dist/index.js panel                          # open live dashboard for all registered projects
```

## Architecture

```
src/
  cli/
    index.ts              # Commander entry — registers all commands
    commands/
      check.ts            # check, check --staged, check --hook-input
      hook-log.ts         # hook-log command + terminal renderer
      setup.ts            # setup — wires hooks, MCP, CLAUDE.md, gitignore
      panel.ts            # panel — starts local dashboard server, opens browser
      mcp.ts              # mcp — starts MCP server
      run.ts / report.ts  # scenario runner + report replay
      scan.ts             # directory/file scanner
      status.ts           # project health check
  core/
    hook-log/
      index.ts            # appendHookLogEntry(), readHookLog(), hookLogPath()
    patterns/
      builtin.ts          # BUILTIN_POLICY — 10 always-on rules
      index.ts            # mergeWithBuiltin() — merges user policy over builtin
    panel/
      server.ts           # startPanelServer() — http + SSE endpoints
      page.ts             # PANEL_PAGE — self-contained dashboard HTML
      tail.ts             # tailLog() — offset-tracking NDJSON tailer
      aggregate.ts        # aggregateEvents() — daily/rule/project rollups
    registry/
      index.ts            # readRegistry(), registerProject() — ~/.crasp/projects.json
    policy/
      loader.ts           # loadPolicy() — YAML → Zod → Policy
      exceptions.ts       # matchesException() — micromatch glob bypass check
      schema.ts           # Zod schema for Policy
    scanner/
      index.ts            # scanContent(), scanFile(), scanDirectory()
      sensitive-paths.ts  # checkSensitivePath() — tier-based path rules
      redact.ts           # redactSensitiveScanResults()
    config/               # loadConfig(), writeConfig()
    engine.ts             # runScenario() — scenario test orchestrator
    evaluator/            # evaluateScenario()
    expectations/         # contains / not_contains / regex evaluation
    violations/           # detectViolations() — policy rule matching
    scenario/             # Zod schema + YAML loader
    report/               # buildRunReport()
  mcp/
    server.ts             # McpServer — crasp_check, crasp_scan, crasp_policy
    tools/                # handleCheck(), handleScan(), handlePolicy()
  reporters/              # terminal, json, html renderers
  storage/                # saveRunReport(), listRuns() → .crasp/runs/
  types/
    index.ts              # all shared TypeScript interfaces (no Zod here)
```

## Key Data Flows

### Hook check pipeline (the main feature)

Hooks invoke the shared bundle at `~/.crasp/bin/crasp.js` via the absolute node path
recorded at setup time (fallback `command -v node` if that node is gone — see
`canonicalHookCommand()` in `setup.ts`). `crasp setup` proves this end-to-end with a
two-stage self-verification before it reports success: Stage 1 spawns the installed
bundle directly (argv) and asserts it denies a synthetic secret, *before* any project
file is wired — a broken pre-existing bundle is auto-repaired by reinstalling and
retrying once. Stage 2 reads the exact Write hook command back out of
`.claude/settings.json` as written to disk and runs it through `/bin/sh`, proving the
file parses, the entry exists, and shell quoting survives — not just what setup intended
to write. Either stage failing aborts setup with a non-zero exit and no success claim.

```
Claude Code fires PreToolUse for Write/Edit/Read/Bash
  → crasp check --hook-input <tool>   (stdin: JSON payload)
      → runHookInputCheck()
          1. Parse stdin JSON
             Write/Edit/Read → { tool_input: { file_path, content/new_string } }
             Bash            → { tool_input: { command } }
          2. loadMergedPolicy()             # builtin + user crasp.policy.yml

          ── Bash branch ──────────────────────────────────────────────────────
          3. matchesBashException()         # command: regex in exceptions → log "exception", exit 0
          4. checkBashCommand()             # heuristic rule engine:
             ask      → permissionDecision:"ask" dialog, log "ask", exit 0
             advisory → buffered (not emitted yet — scanContent runs first)
             (no deny — Bash is always ask-only; user always decides)
          5. scanContent(command)           # scan command text vs policy rules
             match    → permissionDecision:"ask" (advisory prefix prepended if buffered),
                        log "ask", exit 0
             no match + advisory buffered → additionalContext emitted, log "advisory", exit 0
             no match + no advisory → log "clean", exit 0

          ── Write/Edit/Read branch ───────────────────────────────────────────
          3. matchesException()             # if path+op in exceptions → log "exception", exit 0
          4. checkSensitivePath()           # tier-based response:
             advisory  → additionalContext injected into Claude, continue
             high      → permissionDecision:"ask" dialog, log "ask", exit 0
             critical  → permissionDecision:"ask" dialog, log "ask", exit 0
          5. scanContent()                  # Write/Edit only — scan content vs policy rules
             blocking match → permissionDecision:"deny", log "denied", exit 0
          6. All clear → log "clean" or "advisory", exit 0
          ─────────────────────────────────────────────────────────────────────

      → appendHookLogEntry() → .crasp/events.ndjson (NDJSON, never throws)
```

### Inbound check pipeline (PostToolUse)

```
crasp check --hook-input <Tool> --post
  → runInboundHookCheck()   (entire body fail-open: any throw → exit 0)
      1. read stdin (capped ~1MB) → parse JSON → { tool_input, tool_response }
      2. target = redactCommand(url | file_path | (Tool: query))   # logged on every path
      3. text = capInbound(normalizeInbound(extractInboundText(tool_response)))
         empty → log "clean" phase:"post", exit 0
      4. detectInbound(text, policy) = scanContent (secrets + builtin rules)
         + checkInboundInjection (inbound rules, tool-call gated by URL/secret co-occurrence)
      5. findings → additionalContext caution (rule IDs + count, NO excerpt),
         log "inbound-flagged" phase:"post"; else log "clean" phase:"post"
```

`inbound-rules.ts` is the extension point (mirrors `bash-rules.ts`); PostToolUse uses
`additionalContext`, never `permissionDecision`; the caution and the log never contain
matched content.

### MCP server (Claude self-checks)

```
Claude Code ← .mcp.json → crasp mcp (stdio)
  Tools available to Claude:
    crasp_check(content, context?)  → { action: allow|warn|block, violations[] }
    crasp_scan(path, recursive?)    → { results[], summary }
    crasp_policy()                  → { rules[], id, name }
```

### Scenario test runner

```
crasp run <scenario.yml>
  → loadScenario() + loadPolicy()
  → evaluateScenario()
      → evaluateExpectations()  # contains / not_contains / regex
      → detectViolations()      # policy rules vs. step content
  → buildRunReport() → saveRunReport() → .crasp/runs/<id>/report.json
  → terminal/json/html renderer
```

### Panel (live dashboard)

```
crasp panel
  → readRegistry()            # ~/.crasp/projects.json, written by setup / healthy status
  → per project: readHookLog() for bootstrap, tailLog() for live SSE
  → http://127.0.0.1:4269     # single self-contained page, read-only, localhost-only
```

## Sensitive Path Tiers

Defined in `src/core/scanner/sensitive-paths.ts`. Three tiers:

| Tier | Files | Response |
|---|---|---|
| `advisory` | `.env*` (read), `~/.aws/credentials` (read) | additionalContext warning to Claude |
| `high` | `.env*` (write/edit), `~/.aws/credentials` (write/edit) | ask dialog |
| `critical` | `*.pem`, `*.key`, `*.p12`, `id_rsa`, etc. | ask dialog |

To add a new sensitive path rule: add an entry to `SENSITIVE_PATH_RULES` array in `sensitive-paths.ts`.

## Builtin Policy Rules

Defined in `src/core/patterns/builtin.ts`. Always active, merged with the user's `crasp.policy.yml`:
- `token-leakage` (critical) — leaked API keys, `sk-*`, `github_pat_*`, bearer tokens
- `credential-exfiltration` (critical) — instructions to steal/dump credentials
- `prompt-injection` (high) — "ignore previous instructions" patterns
- `ssrf` (high) — cloud metadata endpoints
- `path-traversal` (high) — `../..`, `/etc/passwd`
- `code-execution` (high) — `eval()`, `child_process`, `os.system()`
- `data-exfiltration` (high) — instructions to exfiltrate databases/secrets
- `pii-exposure` (high) — SSN, credit card, passport patterns
- `jailbreak-attempt` (medium) — DAN mode, bypass safety controls
- `system-prompt-extraction` (medium) — reveal system prompt attempts

## Conventions

- Imports use `.js` extension (ESM, `"type": "module"` in package.json)
- Zod schemas in `schema.ts` per module; TypeScript interfaces in `src/types/index.ts` (no Zod there)
- Pure functions only — no classes, no global state
- Severity levels: `low < medium < high < critical`
- `appendHookLogEntry()` must never throw — all logging failures are silently swallowed
- CLI integration tests use `spawnSync("node", [CLI, ...])` against `dist/index.js` — always build first

## Git Safety

**Never commit these — they are gitignored for good reason:**
- `.crasp/` — run artifacts, hook event log, machine state
- `dist/` — compiled output, regenerated by `pnpm build`
- `graphify-out/` — knowledge graph cache, regenerated by `graphify update .`
- `.mcp.json` — absolute path to crasp binary, machine-specific
- `.claude/settings.json` — absolute path to crasp binary, machine-specific
- `node_modules/` — obvious

**Safe to commit:** `.claude/CLAUDE.md`, `.claude/skills/`, `scenarios/`, `src/`, `tests/`, `crasp.policy.yml`, `package.json`, `tsconfig.json`, `.github/`

## How to Extend

### Add a new bash command rule
1. Add a rule object to `BASH_COMMAND_RULES` in `src/core/scanner/bash-rules.ts`
2. Test it in `tests/core/bash-rules.test.ts`

### Add a new builtin rule
1. Add a rule object to the `rules` array in `src/core/patterns/builtin.ts`
2. Test it in `tests/core/patterns.test.ts`
3. If it should fire as a hook block (deny), verify it appears in `tests/cli/check-hook-input.test.ts`

### Add a new sensitive path tier
1. Add an entry to `SENSITIVE_PATH_RULES` in `src/core/scanner/sensitive-paths.ts`
2. Add tests in `tests/core/sensitive-paths.test.ts`
3. Add a CLI integration test in `tests/cli/check-hook-input.test.ts`

### Add a new hook outcome
1. Add to `HookLogOutcome` union type in `src/types/index.ts`
2. Add the outcome icon to `ICONS` map in `src/cli/commands/hook-log.ts`
3. Call `appendHookLogEntry(..., "new-outcome")` at the new exit in `check.ts`

### Add an expectation type (scenario runner)
1. Add the literal to `z.enum` in `src/core/scenario/schema.ts`
2. Add to the union in `src/types/index.ts`
3. Implement in `evaluateExpectation()` in `src/core/expectations/index.ts`
4. Cover with a test in `tests/core/evaluator.test.ts`

## Available Skills

| Skill | Trigger | Purpose |
|---|---|---|
| `test-hook` | `/test-hook` | Simulate a hook payload and see what Crasp does |
| `new-scenario` | `/new-scenario` | Generate a scenario YAML from a description |
| `new-policy` | `/new-policy` | Generate a policy YAML from rule descriptions |
| `run-fence` | `/run-fence` | Build + run scenarios and interpret results |
| `audit-safety` | `/audit-safety` | Full sweep of all scenarios against the active policy |
