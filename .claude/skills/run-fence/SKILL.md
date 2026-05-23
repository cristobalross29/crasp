# Skill: run-fence

Build Crasp and run one or more scenarios, then interpret the results for the user.

## When this skill is invoked

The user types `/run-fence` optionally followed by a scenario path or glob, e.g.:
- `/run-fence` — run all scenarios in `scenarios/`
- `/run-fence scenarios/safe-refusal-demo.yml`
- `/run-fence scenarios/sql-injection.yml --policy custom.policy.yml`

## Steps

1. **Parse arguments** — Extract from the user's message:
   - Scenario path(s) or glob (default: `scenarios/*.yml`)
   - Policy path (default: none — the CLI auto-loads `crasp.policy.yml` if present)
   - Output format (default: `terminal`)

2. **Ensure the project is built**:
   ```sh
   pnpm build
   ```
   If the build fails, report the TypeScript/tsup error to the user and stop.

3. **Run each scenario** — For each resolved path, run:
   ```sh
   node dist/index.js run <scenario-path> [--policy <policy-path>] [--format json]
   ```
   Capture stdout and exit code.

4. **Interpret results** — Summarize in a table:

   | Scenario | Status | Expectations | Violations |
   |---|---|---|---|
   | safe-refusal-demo | passed | 1/1 | 0 |
   | sql-injection | failed | 0/1 | 2 critical |

   For each **failure**, explain:
   - Which expectations failed and why (what phrase was expected/forbidden, what the actual content was)
   - Which policy rules fired and on which step
   - A specific suggestion to fix the scenario or the expectation

5. **List stored run IDs** — After running, note the run IDs so the user can retrieve full reports:
   ```sh
   node dist/index.js list
   ```

## Rules

- Always build before running — never assume `dist/` is current.
- If `scenarios/` does not exist, tell the user to run `crasp setup` first to generate starter scenarios.
- Do not silently swallow non-zero exit codes — a `failed` status is meaningful.
- If multiple scenarios are run and some pass and some fail, report both clearly; do not summarize as "some issues found."
- If the user asks to fix a failing scenario, use the `/new-scenario` skill to regenerate it, or edit the YAML directly based on the failure message.
