# Crasp - Agent Collaboration Guide

This document defines how Claude Code and Codex are used in this project, their
division of responsibility, and the workflows they follow.

## Project Navigation

Start with `CLAUDE.md` for a project overview and key commands. For the full module map,
data flows, and extension guides, read `.claude/CLAUDE.md`. When exploring unfamiliar
parts of the codebase, read the relevant `src/` files directly — the architecture section
in `.claude/CLAUDE.md` maps every module to its responsibility.

## Agents

### Claude Code

Role: Primary development assistant. Handles feature work, code review,
scenario/policy authoring, debugging, and documentation.

Use Claude Code for:

- Writing or modifying TypeScript source in `src/`
- Creating or reviewing scenario/policy YAML files
- Authoring and running tests
- Explaining codebase structure or data flow
- Generating new scenarios or policies via `/new-scenario` and `/new-policy`
- Running Crasp and interpreting results via `/run-fence` and
  `/audit-safety`
- Refactoring, type fixes, and dependency changes

Default model: `claude-sonnet-4-6`. Upgrade to `claude-opus-4-7` for complex
multi-file refactors or security reasoning tasks.

Project skills:

| Skill | Command | Description |
| --- | --- | --- |
| new-scenario | `/new-scenario` | Generate a scenario YAML from a natural-language description |
| new-policy | `/new-policy` | Generate a policy YAML from rule descriptions |
| run-fence | `/run-fence` | Build the project and run Crasp against one or more scenarios |
| audit-safety | `/audit-safety` | Run all scenarios under `scenarios/` with the default policy |

### Codex

Role: Focused implementation delegate. Best used for well-scoped,
self-contained tasks where the approach is already decided and the main
challenge is writing correct code quickly.

Use Codex for:

- Implementing a new expectation type end-to-end
- Adding a new reporter with logic and wiring
- Writing a batch of unit tests for a module
- Porting or migrating code under clear before/after specs
- Investigating a failing test and proposing a fix

Avoid Codex for:

- Open-ended design decisions
- Anything requiring interactive CLI input
- Tasks that span many loosely coupled modules without a clear spec

Trigger Codex from Claude Code with `/codex:rescue` when Claude Code is stuck
on a tricky implementation or wants a second pass on a failing test. Provide
the exact failing test path or the specific function to implement.

## Shared Workflows

### Adding a New Feature

1. Claude Code explores the codebase and proposes an approach.
2. If implementation is straightforward, Claude Code implements it.
3. If implementation is large and well-scoped, delegate to Codex with a precise
   task spec.
4. After implementation, run `pnpm build && pnpm test && pnpm typecheck`.
5. Claude Code reviews the diff and writes the commit.

### Authoring a Safety Scenario

1. Run `/new-scenario` and describe the AI behavior to test.
2. Claude Code generates the YAML in `scenarios/`.
3. Run `/run-fence` to validate it passes or fails as intended.
4. Commit the YAML alongside any supporting policy updates.

### Auditing Safety Coverage

1. Run `/audit-safety` to sweep all scenarios against the project policy.
2. Claude Code summarizes pass/fail counts and flags any high/critical
   violations.
3. Add missing scenarios or tighten policy rules based on the findings.

### Debugging a Failing Run

1. Run `/run-fence <scenario>` to see the full report.
2. Inspect `.crasp/runs/<run-id>/report.json` for raw violation and
   expectation data.
3. If the root cause is unclear, use `/codex:rescue` with the run ID and failing
   expectation IDs.

## Branch and Commit Conventions

- Feature work: `feat/<short-name>`
- Bug fixes: `fix/<short-name>`
- Scenario additions: `scenarios/<short-name>`
- Policy changes: `policy/<short-name>`

Commit messages follow conventional commits: `feat:`, `fix:`, `test:`, and
`docs:`.

## Model Selection

| Task | Agent | Model |
| --- | --- | --- |
| Everyday development | Claude Code | `claude-sonnet-4-6` |
| Complex security reasoning | Claude Code | `claude-opus-4-7` |
| Focused implementation tasks | Codex | Codex default |
| Batch test authoring | Codex | Codex default |
