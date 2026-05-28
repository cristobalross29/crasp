# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.1.0] - 2026-05-24

Initial release.

### Added

- **Hook guard** — registers as a Claude Code `PreToolUse` hook via `crasp setup`.
  Intercepts every Write, Edit, and Read before it executes and enforces your policy
  locally. No cloud, no telemetry.
- **MCP server** — `crasp mcp` starts a stdio MCP server. Claude Code connects to it
  automatically via `.mcp.json`. Exposes three tools Claude can call proactively:
  `crasp_check`, `crasp_scan`, `crasp_policy`.
- **10 built-in security rules** — always active, no configuration required:
  `token-leakage`, `credential-exfiltration`, `prompt-injection`, `ssrf`,
  `path-traversal`, `code-execution`, `data-exfiltration`, `pii-exposure`,
  `jailbreak-attempt`, `system-prompt-extraction`.
- **Sensitive path detection** — three-tier system for `.env` files, cloud credentials,
  private keys, and certificates. Advisory tier injects a warning into Claude's context;
  high and critical tiers show an ask dialog before allowing access.
- **Policy engine** — regex-based rules in `crasp.policy.yml`. Merged with built-in
  rules on every check. Built-in rules always win on conflict.
- **Exception system** — pre-approve specific file paths and operations in
  `crasp.policy.yml` to bypass the ask dialog for known-safe files.
- **Scenario runner** — `crasp run <scenario.yml>` evaluates YAML transcripts against
  `contains`, `not_contains`, and `regex` expectations. Useful for testing that your
  policy catches what it should.
- **`crasp setup`** — one command wires everything: hook guard, MCP server, git
  pre-commit hook, starter policy, starter scenarios, and a CLAUDE.md section.
- **`crasp status`** — verifies that all components are correctly wired.
- **`crasp hook-log`** — shows hook activity from `.crasp/events.ndjson`.
- **`crasp scan`** — scans files or directories against the active policy.
- **`crasp check --staged`** — scans staged git files before commit.
- **Run reports** — every scenario run stored under `.crasp/runs/` as terminal, JSON,
  or HTML output.

[Unreleased]: https://github.com/cristobalross29/crasp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cristobalross29/crasp/releases/tag/v0.1.0
