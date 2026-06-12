# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- Inbound content scanning via PostToolUse hooks (Read, Bash, WebFetch,
  WebSearch). Tool results are scanned for indirect prompt-injection and leaked
  secrets before they re-enter Claude's context. Findings surface as a
  non-blocking `additionalContext` caution (PostToolUse has no approval dialog)
  that lists only the triggered rule IDs and a count — matched content is never
  echoed into context or the log. New `crasp check --hook-input <Tool> --post`
  surface, new `inbound-flagged` hook-log outcome, and a `phase` field
  distinguishing pre/post events. Input is normalized (NFKC, zero-width/bidi
  stripped) and bounded before scanning; the inbound path fails open.

---

## [0.1.2] - 2026-06-11

### Added

- **Bash command interception** — `crasp setup` now installs a fourth `PreToolUse`
  hook on `Bash`, the highest-risk surface an agent touches. Every command Claude
  Code runs is screened by a curated rule engine before it executes:
  - *Destructive / risky* (surface an approval dialog): `rm -rf` (including
    `rm -{r,f}` brace forms), `git push --force` and refspec force-push
    (`+HEAD:main`), `git reset --hard`, `sudo`, `chmod 777`, `dd`/`mkfs` disk
    writes, fork bombs, `curl|wget … | sh`, history wipes, database drops, and
    package publishes.
  - *Secret exfiltration* (approval dialog): network commands that reference a
    secret file (`.env`, `id_rsa`, `~/.aws/credentials`) or a captured secret
    (`$(cat …)`).
  - *Advisory* (a note injected into Claude's context, no dialog): outbound
    `curl`/`wget` to external hosts, reading secret files to stdout, global
    package installs.
  - Crasp **never hard-blocks a Bash command** — the strongest outcome is an
    "ask" dialog, so you always make the final call.
- **Bash command exceptions** — pre-approve specific commands with a `command:`
  regex and the new `bash` op in `crasp.policy.yml`, e.g.
  `- command: "^rm -rf node_modules$"` / `ops: [bash]`. Anchor patterns so a
  permissive regex does not approve more than you intend.
- **`crasp hook-log`** now renders Bash command entries alongside file operations.

### Security

- **Broadened secret redaction in the activity log and hook messages.** Commands
  are sanitized before they are written to `.crasp/events.ndjson` or sent to
  Claude. In addition to the existing `sk-*`, `github_pat_*`, `ghp_*`, AWS
  `AKIA*`, Slack, and JWT patterns, redaction now covers URL userinfo credentials
  (`scheme://user:pass@host`), `curl -u user:pass`, secret-named environment
  assignments (`*_TOKEN=`, `*_SECRET=`, `*_PASSWORD=`, `*_KEY=`, …), Stripe
  (`sk_live_*`/`rk_*`), GitLab (`glpat-*`), and Google (`AIza*`) keys, and PEM
  private-key blocks.

### Changed

- **The PreToolUse hook now fails open on malformed input** so a mistake never
  breaks your workflow: a `null` or non-object payload exits cleanly, and a
  malformed `crasp.policy.yml` falls back to the built-in rules instead of
  erroring on every Write, Edit, Read, and Bash call.
- **Policy exceptions are validated more strictly** — an exception with neither a
  `path` nor a `command` is now rejected at load time instead of silently
  matching nothing.

---

## [0.1.1] - 2026-05-28

### Fixed

- **Secret redaction in deny messages** — The `permissionDecisionReason` sent to Claude no
  longer contains raw matched values (e.g. `sk-abc...`). Matched secrets are now redacted to
  `sk-ab...[REDACTED]...1234` before appearing in Claude's context. The same fix closes an
  identical leak in `--stdin` stderr output.
- **Single JSON object on stdout** — When a file path triggered an advisory warning AND the
  content scan found a blocking violation, two JSON objects were emitted to stdout (which
  Claude Code could not parse). Advisory messages are now buffered and either merged into the
  deny reason or emitted once at the end when no block fires.
- **Exceptions now run the content scan** — Previously an entry in `crasp.policy.yml`
  exceptions would silently exit before the content scan, meaning a whitelisted path could
  write a leaked API key without a deny. Exceptions now only skip the sensitive-path ask
  dialog; content scanning always runs.
- **Full-path matching for exceptions** — `matchesException` previously matched only on the
  file basename, so a directory-scoped exception pattern like `secrets/*.key` would never
  match. Matching now checks the basename, the project-relative path, and the absolute path.
- **Medium/low matches no longer logged as clean** — Jailbreak and system-prompt-extraction
  matches (medium severity) were silently dropped and logged as `clean`. They are now logged
  as `advisory` so they appear in `crasp hook-log`.
- **MCP policy tool strips regex patterns** — `crasp_policy` no longer returns the raw regex
  pattern strings that power detection rules. Exposing them to Claude would let it craft
  content that evades detection. The `id`, `description`, `severity`, `target`, and `message`
  fields are still returned.

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

[Unreleased]: https://github.com/cristobalross29/crasp/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/cristobalross29/crasp/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/cristobalross29/crasp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/cristobalross29/crasp/releases/tag/v0.1.0
