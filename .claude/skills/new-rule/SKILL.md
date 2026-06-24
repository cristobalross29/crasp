---
name: new-rule
description: Use when adding a new built-in detection rule to Crasp's source — a bash-command rule, a builtin policy rule, a sensitive-path tier, or an inbound (PostToolUse) rule. Scaffolds the rule object in the correct file AND its paired test, then builds and verifies the rule fires. Distinct from /new-policy, which writes a runtime user YAML overlay; this edits shipped TypeScript.
---

# Skill: new-rule

Add a built-in detection rule to Crasp's TypeScript source and its paired test, in one verified flow. This is the skill version of the "How to Extend" checklists in `CLAUDE.md`.

**Not the same as `/new-policy`.** `/new-policy` writes a runtime `crasp.policy.yml` overlay that a *user* drops into their project. `new-rule` edits the rules that **ship inside the binary** — `builtin.ts`, `bash-rules.ts`, `sensitive-paths.ts`, `inbound-rules.ts`. Use this when the detection should be on by default for everyone, not just one project.

## When this skill is invoked

The user types `/new-rule` optionally followed by a description, e.g.:
- `/new-rule block bash commands that pipe curl into sh`
- `/new-rule flag writes to .npmrc as high-tier sensitive`
- `/new-rule` (you will ask for the description and kind)

## Steps

1. **Pick the rule kind** — Ask if not obvious from the description. Each kind has a fixed home:

   | Kind | What it catches | Source file | Test file |
   |---|---|---|---|
   | `bash` | A dangerous shell command (PreToolUse Bash) | `src/core/scanner/bash-rules.ts` | `tests/core/bash-rules.test.ts` |
   | `builtin` | Secret/policy pattern in Write/Edit/Bash content | `src/core/patterns/builtin.ts` | `tests/core/patterns.test.ts` |
   | `sensitive-path` | A file path that's risky to read/write | `src/core/scanner/sensitive-paths.ts` | `tests/core/sensitive-paths.test.ts` |
   | `inbound` | Injection/secret in tool *results* (PostToolUse) | `src/core/scanner/inbound-rules.ts` | `tests/core/inbound-rules.test.ts` |

2. **Read the target file first** — Always read the source file and copy the shape of an existing entry. Do not invent a shape from memory; match the array that's already there. The shapes today are:

   - **bash** — append to `BASH_COMMAND_RULES`. Order matters (first match wins; put specific/dangerous rules before general ones):
     ```ts
     { ruleId: "bash-<slug>", tier: "ask" /* or "advisory" */, describe: "One sentence shown to the user.", test: (c) => /<regex>/i.test(c) }
     ```
     Bash is **ask-only or advisory** — there is no `deny` tier for Bash.

   - **builtin** — append to `BUILTIN_POLICY.rules`:
     ```ts
     { id: "<slug>", description: "What it checks.", severity: "critical|high|medium|low", target: "any", pattern: "<js regex string>", message: "Shown in reports/hook." }
     ```
     A `critical` builtin rule on Write/Edit content fires as a hook **deny**. If your rule is critical, you MUST also add a CLI assertion in `tests/cli/check-hook-input.test.ts`.

   - **sensitive-path** — append to `SENSITIVE_PATH_RULES`. Separate read vs write tiers:
     ```ts
     { test: (basename, fullPath) => /<regex>/.test(basename), writeTier: "high", readTier: "advisory",
       ruleId: "sensitive-<slug>", buildWriteMessage: (b) => `…${b}…`, buildReadMessage: (b) => `…${b}…` }
     ```

   - **inbound** — mirror the existing `checkInboundInjection` pattern in `inbound-rules.ts`. Inbound rules emit `additionalContext` only — never `permissionDecision`, and the caution/log must never contain the matched excerpt.

3. **Write the regex** — Reuse the pattern guidance from `/new-policy`:
   - Alternation for synonyms: `curl|wget|fetch`
   - Word boundaries to avoid substring hits: `\\bnpm\\b`
   - Builtin patterns are strings compiled with `new RegExp(pattern, "i")` — case-insensitive already, no `(?i)`.
   - Prefer specific over broad. A false positive in a security tool erodes trust and trains users to ignore it.

4. **Add the paired test** — In the matching test file, add at least: one input that **must match** and one near-miss that **must NOT match** (the false-positive guard). For `sensitive-path`, assert both the read tier and the write tier.

5. **Build and run the tests**:
   ```sh
   pnpm build && pnpm test
   ```
   Stop and report if either fails.

6. **Verify it fires end-to-end** (for `bash`, `builtin` deny, and `sensitive-path` rules) — simulate the real hook path, the same way `/test-hook` does:
   ```sh
   # bash
   echo '{"tool_input":{"command":"<command that should trigger>"}}' | node dist/index.js check --hook-input Bash
   # builtin / sensitive-path
   echo '{"tool_input":{"file_path":"<path>","content":"<content>"}}' | node dist/index.js check --hook-input Write
   ```
   Confirm the output is the expected `ask`/`deny`/`additionalContext`, then show it to the user.

7. **Typecheck before declaring done**:
   ```sh
   pnpm typecheck
   ```

## Rules

- Always read the target file and match the existing entry shape — never scaffold from memory.
- Every new rule ships with a test in the same change. A rule without a test is not done.
- A `critical` builtin rule must also be asserted in `tests/cli/check-hook-input.test.ts` (it's a hook deny).
- Inbound rules never use `permissionDecision` and never log or echo the matched content.
- Run the full `pnpm build && pnpm test && pnpm typecheck` gate before claiming the rule works.
- If the rule overlaps an existing one, tighten or extend the existing rule instead of adding a near-duplicate.
