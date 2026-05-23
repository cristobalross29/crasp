# AgentFence

Local-first security layer for Claude Code. Intercepts every Write/Edit/Read operation via PreToolUse hooks, scans content for leaked secrets and policy violations, and records a persistent activity log. Also exposes an MCP server so Claude can self-check before acting.

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
    server.ts             # McpServer — agentfence_check, agentfence_scan, agentfence_policy
    tools/                # handleCheck(), handleScan(), handlePolicy()
  reporters/              # terminal, json, html renderers
  storage/                # saveRunReport(), listRuns() → .agentfence/runs/
  types/
    index.ts              # all shared TypeScript interfaces (no Zod here)
```

## Key Data Flows

### Hook check pipeline (the main feature)

```
Claude Code fires PreToolUse for Write/Edit/Read
  → agentfence check --hook-input <tool>   (stdin: JSON payload)
      → runHookInputCheck()
          1. Parse stdin JSON → { tool_input: { file_path, content/new_string } }
          2. loadMergedPolicy()             # builtin + user agentfence.policy.yml
          3. matchesException()             # if path+op in exceptions → log "exception", exit 0
          4. checkSensitivePath()           # tier-based response:
             advisory  → additionalContext injected into Claude, continue
             high      → permissionDecision:"ask" dialog, log "ask", exit 0
             critical  → permissionDecision:"ask" dialog, log "ask", exit 0
          5. scanContent()                  # Write/Edit only — scan content vs policy rules
             blocking match → permissionDecision:"deny", log "denied", exit 0
          6. All clear → log "clean" or "advisory", exit 0
      → appendHookLogEntry() → .agentfence/events.ndjson (NDJSON, never throws)
```

### MCP server (Claude self-checks)

```
Claude Code ← .mcp.json → agentfence mcp (stdio)
  Tools available to Claude:
    agentfence_check(content, context?)  → { action: allow|warn|block, violations[] }
    agentfence_scan(path, recursive?)    → { results[], summary }
    agentfence_policy()                  → { rules[], id, name }
```

### Scenario test runner

```
agentfence run <scenario.yml>
  → loadScenario() + loadPolicy()
  → evaluateScenario()
      → evaluateExpectations()  # contains / not_contains / regex
      → detectViolations()      # policy rules vs. step content
  → buildRunReport() → saveRunReport() → .agentfence/runs/<id>/report.json
  → terminal/json/html renderer
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

Defined in `src/core/patterns/builtin.ts`. Always active, merged with the user's `agentfence.policy.yml`:
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
- `.agentfence/` — run artifacts, hook event log, machine state
- `dist/` — compiled output, regenerated by `pnpm build`
- `graphify-out/` — knowledge graph cache, regenerated by `graphify update .`
- `.mcp.json` — absolute path to agentfence binary, machine-specific
- `.claude/settings.json` — absolute path to agentfence binary, machine-specific
- `node_modules/` — obvious

**Safe to commit:** `.claude/CLAUDE.md`, `.claude/skills/`, `scenarios/`, `src/`, `tests/`, `agentfence.policy.yml`, `package.json`, `tsconfig.json`, `.github/`

## How to Extend

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
| `test-hook` | `/test-hook` | Simulate a hook payload and see what AgentFence does |
| `new-scenario` | `/new-scenario` | Generate a scenario YAML from a description |
| `new-policy` | `/new-policy` | Generate a policy YAML from rule descriptions |
| `run-fence` | `/run-fence` | Build + run scenarios and interpret results |
| `audit-safety` | `/audit-safety` | Full sweep of all scenarios against the active policy |
