# AgentFence — Agent Collaboration Guide

This document defines how **Claude Code** and **Codex** are used in this project, their division of responsibility, and the workflows they follow.

---

## Agents

### Claude Code

**Role:** Primary development assistant. Handles feature work, code review, scenario/policy authoring, debugging, and documentation.

**When to use Claude Code:**
- Writing or modifying TypeScript source in `src/`
- Creating or reviewing scenario/policy YAML files
- Authoring and running tests
- Explaining codebase structure or data flow
- Generating new scenarios or policies (via `/new-scenario`, `/new-policy`)
- Running agentfence and interpreting results (via `/run-fence`, `/audit-safety`)
- Refactoring, type fixes, and dependency changes

**Model:** `claude-sonnet-4-6` (default). Upgrade to `claude-opus-4-7` for complex multi-file refactors or security reasoning tasks.

**Project skills available:**

| Skill | Command | Description |
|---|---|---|
| new-scenario | `/new-scenario` | Generate a scenario YAML from a natural-language description |
| new-policy | `/new-policy` | Generate a policy YAML from rule descriptions |
| run-fence | `/run-fence` | Build the project and run agentfence against one or more scenarios |
| audit-safety | `/audit-safety` | Full safety sweep — runs all scenarios under `scenarios/` with the default policy |

---

### Codex

**Role:** Focused implementation delegate. Best used for well-scoped, self-contained tasks where the approach is already decided and the main challenge is writing correct code quickly.

**When to use Codex:**
- Implementing a new expectation type end-to-end (schema → evaluator → tests)
- Adding a new reporter (logic + wiring)
- Writing a batch of unit tests for a module
- Porting or migrating code under clear before/after specs
- Investigating a failing test and proposing a fix

**When NOT to use Codex:**
- Open-ended design decisions (prefer Claude Code for exploration)
- Anything requiring interactive CLI input
- Tasks that span many loosely coupled modules without a clear spec

**Triggering Codex from Claude Code:**
Use `/codex:rescue` when Claude Code is stuck on a tricky implementation or wants a second pass on a failing test. Provide the exact failing test path or the specific function to implement.

---

## Shared Workflows

### Adding a New Feature

1. Claude Code explores the codebase and proposes an approach.
2. If implementation is straightforward → Claude Code implements it.
3. If implementation is large and well-scoped → delegate to Codex with a precise task spec.
4. After implementation: `pnpm build && pnpm test && pnpm typecheck`.
5. Claude Code reviews the diff and writes the commit.

### Authoring a Safety Scenario

1. Run `/new-scenario` — describe the AI behavior to test.
2. Claude Code generates the YAML in `scenarios/`.
3. Run `/run-fence` to validate it passes (or fails as intended).
4. Commit the YAML alongside any supporting policy updates.

### Auditing Safety Coverage

1. Run `/audit-safety` to sweep all scenarios against the project policy.
2. Claude Code summarizes pass/fail counts and flags any high/critical violations.
3. Add missing scenarios or tighten policy rules based on the findings.

### Debugging a Failing Run

1. Run `/run-fence <scenario>` to see the full report.
2. Inspect `.agentfence/runs/<run-id>/report.json` for the raw violation/expectation data.
3. If the root cause is unclear, use `/codex:rescue` with the run-id and failing expectation IDs.

---

## Branch and Commit Conventions

- Feature work: `feat/<short-name>`
- Bug fixes: `fix/<short-name>`
- Scenario additions: `scenarios/<short-name>`
- Policy changes: `policy/<short-name>`

Commit messages follow conventional commits (`feat:`, `fix:`, `test:`, `docs:`).

---

## Model Selection Quick Reference

| Task | Agent | Model |
|---|---|---|
| Everyday development | Claude Code | `claude-sonnet-4-6` |
| Complex security reasoning | Claude Code | `claude-opus-4-7` |
| Focused implementation tasks | Codex | (Codex default) |
| Batch test authoring | Codex | (Codex default) |
