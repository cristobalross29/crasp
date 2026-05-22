# AgentFence

Local-first TypeScript CLI for testing recorded AI agent safety behavior. Scenario transcripts are evaluated against expectations and policy rules — no cloud required.

## Commands

```sh
pnpm build      # compile src/ → dist/ (esm + .d.ts via tsup)
pnpm test       # run Vitest test suite
pnpm typecheck  # tsc --noEmit
pnpm dev        # watch-mode build
```

After building, drive the CLI directly:

```sh
node dist/index.js init
node dist/index.js run <scenario.yml> --policy <policy.yml>
node dist/index.js list
node dist/index.js report <run-id>
```

Always run `pnpm build && pnpm test && pnpm typecheck` before committing.

## Architecture

```
src/
  cli/
    index.ts            # Commander program entry point
    commands/           # init, run, list, report
  core/
    engine.ts           # runScenario() — top-level orchestrator
    evaluator/          # evaluateScenario() — wires expectations + violations
    expectations/       # evaluateExpectations() — contains / not_contains / regex
    violations/         # detectViolations() — regex pattern matching against steps
    scenario/           # Zod schema + YAML loader
    policy/             # Zod schema + YAML loader
    report/             # buildRunReport() — shapes RunReport
    trace/              # Trace schema (reserved for future live-capture)
  reporters/            # terminal, json, html renderers
  storage/              # saveRunReport(), listRuns() → .agentfence/runs/
  types/                # shared TypeScript interfaces (no Zod here)
```

## Key Data Flow

```
CLI run command
  → runScenario(scenarioPath, { policyPath })
      → loadScenario()           # YAML → Zod → Scenario
      → loadPolicy()             # YAML → Zod → Policy (optional)
      → evaluateScenario()
          → evaluateExpectations()   # contains / not_contains / regex
          → detectViolations()       # regex policy rules vs. steps
      → buildRunReport()
      → saveRunReport()          # .agentfence/runs/<runId>/report.json
  → reporter renders terminal / json / html
```

## Conventions

- Imports use `.js` extension (ESM, `"type": "module"` in package.json)
- Zod schemas in `schema.ts` per module; TypeScript interfaces in `src/types/index.ts`
- Pure functions only — no classes, no global state
- `.agentfence/` is git-ignored (run artifacts)
- Default policy auto-loaded from `agentfence.policy.yml` in the working directory
- Severity levels: `low < medium < high < critical`

## Adding an Expectation Type

1. Add the literal to `z.enum` in `src/core/scenario/schema.ts`
2. Add to the union in `src/types/index.ts`
3. Implement in `evaluateExpectation()` in `src/core/expectations/index.ts`
4. Cover with a test in `tests/core/evaluator.test.ts`

## Adding a Reporter

1. Create `src/reporters/<name>.ts` exporting `render<Name>Report(report: RunReport): string`
2. Wire into `renderReport()` in `src/cli/commands/run.ts`
3. Wire into `src/cli/commands/report.ts` the same way

## Available Skills

| Skill | Trigger | Purpose |
|---|---|---|
| new-scenario | `/new-scenario` | Generate a scenario YAML from a description |
| new-policy | `/new-policy` | Generate a policy YAML from rule descriptions |
| run-fence | `/run-fence` | Build + run agentfence and interpret results |
| audit-safety | `/audit-safety` | Full sweep of all scenarios against the default policy |
