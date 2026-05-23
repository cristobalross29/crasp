# Skill: test-hook

Simulate a Claude Code PreToolUse hook payload and show exactly what AgentFence would do — which tier fired, what response was sent, and what would be logged.

## When this skill is invoked

The user types `/test-hook` followed by a tool and file path, optionally with content:
- `/test-hook Write .env.local` — test writing to .env.local
- `/test-hook Read server.pem` — test reading a private key
- `/test-hook Edit config.ts 'const key = "sk-abc123..."'` — test editing with token content
- `/test-hook` — ask for tool, path, and optional content

## Steps

1. **Parse arguments** — Extract:
   - Tool: `Write`, `Edit`, or `Read` (ask if missing)
   - File path: the file path Claude Code would send (ask if missing)
   - Content: optional — the `content` (Write) or `new_string` (Edit) value

2. **Ensure the project is built**:
   ```sh
   pnpm build 2>/dev/null || true
   ```

3. **Build the JSON payload** based on tool:
   - Write: `{"tool_input":{"file_path":"<path>","content":"<content or empty>"}}`
   - Edit: `{"tool_input":{"file_path":"<path>","new_string":"<content or empty>"}}`
   - Read: `{"tool_input":{"file_path":"<path>"}}`

4. **Run the hook check**:
   ```sh
   echo '<payload>' | node dist/index.js check --hook-input <tool>
   ```
   Capture stdout, stderr, and exit code.

5. **Interpret and explain the result**:

   | stdout | Meaning |
   |---|---|
   | `""` (empty) | **CLEAN** — no rule matched, operation allowed silently |
   | `permissionDecision: "ask"` | **ASK DIALOG** — user sees a dialog before Claude proceeds. Show the `permissionDecisionReason`. |
   | `permissionDecision: "deny"` | **HARD BLOCK** — Claude Code cancels the operation. Show the `permissionDecisionReason`. |
   | `additionalContext: "..."` | **ADVISORY** — Claude receives a warning in its context, operation allowed. Show the context message. |

   Always explain:
   - Which rule or path check triggered (if any)
   - What tier it is (advisory / high / critical)
   - What the developer would see in Claude Code
   - What would be logged to `.agentfence/events.ndjson`

6. **Check the hook log** — show what was just written:
   ```sh
   node dist/index.js hook-log --days 1
   ```

## Example output

```
Testing: Write .env.local

Result: ASK DIALOG (tier: high, rule: sensitive-env-file)

What Claude Code shows the developer:
  ⚠️  AgentFence Warning

  Writing to .env.local — this file likely contains API keys and secrets.
  ...

What would be logged:
  { ts: "...", tool: "Write", filePath: ".env.local", outcome: "ask", tier: "high", ruleId: "sensitive-env-file" }

To pre-approve this path, add to agentfence.policy.yml:
  exceptions:
    - path: ".env.local"
      ops: [write, edit]
      reason: "I manage .env.local directly"
```

## Rules

- Always build before running — never assume `dist/` is current.
- If the payload contains real secrets (e.g. an actual API key), note that it will be logged to `.agentfence/events.ndjson`.
- If the user wants to test an exception, remind them to add the exception to `agentfence.policy.yml` in the working directory, then rerun.
- Show the raw JSON response alongside the human-readable interpretation — developers often want to see the exact hook output.
