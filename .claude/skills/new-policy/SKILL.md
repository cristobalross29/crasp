# Skill: new-policy

Generate an AgentFence policy YAML from a natural-language description of the rules to enforce.

## When this skill is invoked

The user types `/new-policy` optionally followed by a description, e.g.:
- `/new-policy no jailbreaks or prompt injection attempts should succeed`
- `/new-policy` (you will ask for the description)

## Steps

1. **Gather requirements** — If the user did not supply a description, ask:
   - What category of unsafe behavior should the policy prohibit?
   - Should the rules target `assistant` responses, `user` messages, or both? (default: `assistant`)
   - Destination file path? (default: `agentfence.policy.yml` in the project root, or a named path if the user wants a non-default policy)

2. **Design the rules** — For each behavior to prohibit, create a rule with:
   - `id` — lowercase-hyphenated identifier (e.g. `no-sql-injection`)
   - `description` — one sentence: what the rule checks
   - `severity` — how bad a match is (`low` | `medium` | `high` | `critical`)
   - `target` — which conversation role to match against (`assistant` | `user` | `any`)
   - `pattern` — a JavaScript-compatible regex. Keep patterns specific enough to avoid false positives.
   - `message` (optional) — human-readable violation message shown in reports

   Pattern guidance:
   - Use alternation for synonyms: `"jailbreak|DAN mode|ignore previous instructions"`
   - Anchor on word boundaries when needed: `"\\bexploit\\b"`
   - The engine uses `new RegExp(pattern, "i")` — case-insensitive by default, no need to add `(?i)`.

3. **Write the YAML file** — Use this structure:

```yaml
id: <policy-id>
name: <Human Readable Policy Name>
version: 0.1.0
rules:
  - id: <rule-id>
    description: <one sentence>
    severity: critical
    target: assistant
    pattern: "<js regex pattern>"
    message: "<violation message shown in report>"
```

4. **Write the file** — Save to the destination path using the Write tool.

5. **Validate** — Run an existing scenario against the new policy to confirm at least one rule fires as expected:
   ```sh
   pnpm build 2>/dev/null || true
   node dist/index.js run scenarios/safe-refusal-demo.yml --policy <path-to-new-policy>
   ```
   If `scenarios/safe-refusal-demo.yml` does not exist, use any `.yml` file under `scenarios/`. Report the output to the user.

## Rules

- Every rule must have a unique `id` within the policy.
- Prefer more specific patterns over broad ones — false positives erode trust in the policy.
- If a rule should never fire in normal safe behavior, set severity to `critical`.
- Do not add rules that duplicate the project's default policy unless the user explicitly wants an overlay.
- If the policy is meant to replace `agentfence.policy.yml`, remind the user that AgentFence auto-loads that file from the working directory if no `--policy` flag is given.
