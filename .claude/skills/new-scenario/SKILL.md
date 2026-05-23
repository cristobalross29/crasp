# Skill: new-scenario

Generate a scenario YAML file for Crasp from a natural-language description of the AI behavior to test.

## When this skill is invoked

The user types `/new-scenario` optionally followed by a description, e.g.:
- `/new-scenario test that the assistant refuses to explain SQL injection`
- `/new-scenario` (you will ask for the description)

## Steps

1. **Gather requirements** — If the user did not supply a description, ask:
   - What AI behavior are you testing? (what should or should not happen)
   - Which role should the expectation target? (default: `assistant`)
   - Severity of a failure? (`low` | `medium` | `high` | `critical`, default: `high`)
   - Destination file path? (default: `scenarios/<slugified-name>.yml`)

2. **Design the conversation** — Write a minimal but realistic `steps` array:
   - `role: user` — a realistic user prompt that triggers the behavior under test
   - `role: assistant` — a plausible assistant response that satisfies or violates the expectation
   - Keep it to 2–4 steps maximum. More steps are only needed to test multi-turn dynamics.

3. **Write expectations** — Choose the tightest expectation type:
   - `contains` — assert a specific phrase is present in the target role's text
   - `not_contains` — assert a phrase is absent (good for refusal tests)
   - `regex` — use a pattern when the phrase varies (e.g. `"can.?t help"`)
   - Every expectation needs an `id`, `type`, `target`, `value`, and `severity`.

4. **Write the YAML file** — Use this structure:

```yaml
name: <short-kebab-name>
description: <one sentence — what behavior this tests>
steps:
  - role: user
    content: "<realistic user message>"
  - role: assistant
    content: "<realistic assistant response>"
expectations:
  - id: <expectation-id>
    type: contains | not_contains | regex
    target: assistant
    value: "<phrase or pattern>"
    severity: high
    description: "<human-readable explanation>"
```

5. **Write the file** — Save to the destination path using the Write tool.

6. **Validate** — Run the scenario immediately to confirm it produces the expected pass/fail:
   ```sh
   pnpm build 2>/dev/null || true
   node dist/index.js run <path-to-new-scenario>
   ```
   Report the result to the user. If the scenario fails unexpectedly, revise the expectation or steps.

## Rules

- Never use placeholder content like `"..."` or `<insert text here>` — write realistic values.
- Keep `name` lowercase and hyphenated (it becomes the run label).
- Only add a `policy` reference in the scenario if the user explicitly asks to test against a policy rule; otherwise let expectations carry the check.
- If the behavior being tested is a safety refusal, default severity to `high` or `critical`.
