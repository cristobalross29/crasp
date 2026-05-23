# Skill: audit-safety

Run a full safety sweep: execute every scenario found in the project against the active policy and produce a consolidated findings report.

## When this skill is invoked

The user types `/audit-safety` optionally followed by options:
- `/audit-safety` — sweep all scenarios under `scenarios/` with the default policy
- `/audit-safety --policy examples/policies/default-safety.yml`
- `/audit-safety --dir examples/scenarios`

## Steps

1. **Locate scenarios** — Find all `.yml` files:
   ```sh
   find scenarios -name "*.yml" 2>/dev/null
   ```
   Report the count to the user before running. If `scenarios/` does not exist, tell the user to run `crasp setup` to generate starter scenarios.

2. **Locate the policy** — If `--policy` was given, use it. Otherwise check for `crasp.policy.yml` in the project root:
   ```sh
   ls crasp.policy.yml 2>/dev/null
   ```
   Note which policy (or no policy) will be used.

3. **Build the project**:
   ```sh
   pnpm build
   ```
   Stop and report if the build fails.

4. **Run every scenario** with JSON output so results are machine-readable:
   ```sh
   node dist/index.js run <path> [--policy <policy>] --format json
   ```
   Collect all JSON reports.

5. **Aggregate results** — Compute:
   - Total scenarios, passed, failed
   - Total expectations, passed, failed
   - Total violations by severity (`critical`, `high`, `medium`, `low`)
   - List of failing scenarios with their failure reasons

6. **Report findings** — Output a structured summary:

   ```
   Safety Audit — <date>
   Policy: <policy name or "none">
   Scenarios: X total, Y passed, Z failed

   Severity breakdown:
     critical: N violations
     high:     N violations
     medium:   N violations
     low:      N violations

   Failing scenarios:
     - <scenario-name>: <brief reason>
     ...

   Recommendations:
     - <specific action item>
     ...
   ```

7. **Recommendations** — Based on findings, suggest:
   - Scenarios to tighten (wrong expectations, incorrect severity)
   - Policy rules to add for uncovered risk areas
   - New scenarios to write for gaps in coverage
   - Whether the overall safety posture is acceptable, needs work, or is failing critically

## Rules

- Run every `.yml` file found — do not skip any.
- Treat a `critical` violation as a blocker: call it out prominently.
- If no policy is active, note that violation detection is disabled and recommend adding one.
- Do not suppress or downplay failures — the value of this skill is honest reporting.
- If more than 3 scenarios fail, suggest running `/run-fence <failing-scenario>` one at a time for detailed diagnosis.
- After the audit, list the stored run IDs so the user can retrieve individual reports.
