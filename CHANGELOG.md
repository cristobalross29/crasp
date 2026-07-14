# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [0.2.4] - 2026-07-14

### Added
- **Scan exceptions — an explicit `scan` op for policy exceptions.** Files that
  legitimately quote rule patterns (docs, security guides, rule tests) can be
  excepted from policy-rule matching in `check --staged`, `check <paths>`,
  `crasp scan`, and MCP `crasp_scan`. Excepted files are **still scanned for
  secrets** and are always reported (`ScanSummary.exceptedFiles` + a terminal
  note) — never skipped silently. `ops: [any]` deliberately does NOT imply
  `scan`, so pre-0.2.4 policies keep their exact hook-only meaning. Scan globs
  resolve relative to the repo root (no basename tier, dotfiles included).
- **Per-rule `caseSensitive` flag documented in the README** (shipped in 0.2.3).

### Changed
- **`check --staged` scans the git index, not the working tree.** The gate now
  reads staged blobs via `git show :<path>`, so a file edited after `git add`
  can't slip modified content past the check and unstaged changes aren't
  falsely flagged. Enumeration is NUL-safe, includes typechange entries, and
  skips only deletions (`--diff-filter=ACMRT -z`); blobs are read in parallel
  with a 5 MB cap; staged paths, exception globs, and `.crasp/config.json` all
  resolve against `git rev-parse --show-toplevel`, so subdirectory invocations
  work.
- **Default-excluded paths are rule-suppressed, not skipped, in staged scans.**
  `crasp.policy.yml`, `.env.example`-style templates, and files under
  default-excluded directories (`.claude/`, `scenarios/`, …) get the same
  treatment as scan exceptions — policy rules suppressed, secrets still
  scanned — instead of being invisible to the gate.

### Fixed
- **`mergeWithBuiltin()` dropped the user policy's `secrets.allowlist`**, so
  allowlists never reached CLI or MCP scans.
- **Exception globs now match dotfiles and dot-directories** (`docs/**` covers
  `docs/.vitepress/…`).
- Policy schema keeps accepting every 0.2.3-valid exception shape; only the
  new `scan` op requires a `path`.

---

## [0.2.3] - 2026-07-12

### Changed
- **`crasp panel` redesigned into a four-tab dashboard.** Overview (a
  verdict banner — All clear / Needs a look / Attention — plus today's
  checked/asked/blocked tiles and an activity chart), Activity (a flagged-first
  feed that collapses routine clean runs and writes each event as a plain
  sentence), Rules (every rule that fired, with a plain-language name and a
  one-line explanation), and Projects (per-project health cards, including
  folders that went missing, and a copyable setup command).
- **Overview chart is now interactive and range-driven.** A range dropdown
  (Live · 10 · 15 · 30 · 45 · 60 · 90 days) sets the window; the chart spans the
  chosen range with a colour legend, per-day hover tooltips (date + full
  clean/advisory/asked/blocked/total breakdown), and date-axis labels.
- **Live is a "from now" view.** Selecting Live zeroes the tiles/feed/chart and
  counts only events after that moment (a Restart button re-zeroes); switching
  back to a day range shows the true window, including everything logged while
  Live was active.

### Added
- **Per-rule `caseSensitive` flag** in policy rules — set it when the casing is
  the signal (e.g. the JS `Function()` constructor vs. a lowercase `function`
  declaration).
- **Project registry `~/.crasp/projects.json`** feeds the panel: `crasp setup`
  and a healthy `crasp status` register the project so the panel aggregates all
  of them; `/api/bootstrap` gained a `since` filter and merged built-in + user
  rule metadata.

### Fixed
- **`code-execution` rule no longer flags ordinary JavaScript.** It was compiled
  case-insensitively, so `Function\s*\(` matched every lowercase `function (`
  and denied edits to normal source. The rule is now case-sensitive and matches
  real dynamic-execution primitives (`new`/bare `Function(...)`, `eval` incl.
  `(0,eval)()`, `child_process.*` incl. `*Sync`, `os.system`, string
  `setTimeout`/`setInterval`, case-tolerant PowerShell `-EncodedCommand`,
  `curl … | sh`) without matching ordinary code.
- Panel bootstrap read window is aligned to the oldest chart day, so the feed
  and the chart cover exactly the same span.
- `crasp watch` (removed in 0.2.2) fully retired; the panel is the single
  activity view.

## [0.2.2] - 2026-07-10

### Added
- **`crasp panel` — live web dashboard.** One command opens a local page
  (`127.0.0.1:4269`) showing Crasp activity across every protected project on
  the machine: per-project protection health (hooks wired, bundle healthy),
  a live event feed (SSE, ~1s latency) of every Write/Edit/Read/Bash check
  with redacted targets and the rule that fired, today's
  clean/advisory/asked/denied totals, a 30-day activity chart, and top-rule /
  per-project breakdowns. A `30d · 90d · live` toggle picks how much history
  to load — events are logged whether or not the panel is open, so nothing is
  ever missed. Read-only and private: localhost-only bind, foreign `Host`
  headers rejected (DNS-rebinding defense), self-contained page with zero
  external requests. `--port` and `--no-open` flags.
- **Project registry.** `crasp setup` (and any healthy `crasp status`)
  records the project in `~/.crasp/projects.json`; the panel aggregates all
  registered projects from anywhere.

### Removed
- `crasp watch` (the terminal dashboard) — replaced by `crasp panel`.

### Fixed
- Install: the shared bundle at `~/.crasp/bin/` is now pinned as ESM with its
  own `package.json` marker. Previously a stray `~/package.json` without
  `"type": "module"` made Node load the bundle as CommonJS, breaking setup
  and every wired hook on that machine.
- `crasp status` no longer registers a random, uninitialized folder in the
  panel registry just because the machine-wide install is healthy.

---

## [0.2.1] - 2026-07-07

### Added
- Two-stage setup self-verification: the installed bundle AND the exact hook
  command written to `.claude/settings.json` are both proven to block a
  synthetic secret before setup reports success; broken pre-existing installs
  are auto-repaired.
- `crasp status` now reports `installHealth`: missing bundle, dead node/bundle
  paths in hooks, `.mcp.json`, and the git pre-commit hook, plus legacy hook
  formats — each with remediation.
- `setup --force` reinstalls the shared bundle unconditionally.

### Changed
- **Package moved to `@crasp/cli`** (was `@cristobalross29/crasp`; the unscoped
  name `crasp` is reserved on npm). The installed command is still `crasp`.
- The CLI is a fully self-contained single-file bundle; `crasp setup` installs
  it to `~/.crasp/bin/crasp.js` (atomic, version-aware) and wires all hooks
  with absolute node+bundle paths plus a `command -v node` fallback — a pure
  `npx @crasp/cli setup` now yields verified protection with no global install.
- Re-running setup migrates any older crasp hook format and warns when a stale
  global crasp binary is still on PATH.
- Pre-commit hook skips (fail-open, with a message) when its recorded paths
  vanish; `crasp status` flags it.
- The committed CLAUDE.md section now tells fresh-clone teammates to run
  `npx @crasp/cli setup` instead of claiming protection is active.
- **Node.js 20+ is now required** (`engines: >=20`; commander 14 requires it and
  Node 18 is end-of-life). All runtime dependencies are bundled into the single
  CLI file and moved out of the published `dependencies`, so installing `crasp`
  pulls zero transitive packages.

### Fixed
- Hooks written by an npx-only install pointed at a `crasp` binary that did
  not exist, silently disabling protection.
- MCP server reported version 0.1.0 regardless of release.

---

## [0.2.0] - 2026-06-24

### Added

- **Dedicated multi-provider secret detection (`secrets.ts` module).** Replaces the
  single `token-leakage` builtin rule with ~22 per-provider matchers covering AWS,
  Anthropic, OpenAI, GitHub, GitLab, Stripe (keys + webhooks), Google (API + OAuth),
  Azure, Slack (tokens + webhooks), SendGrid, Twilio, HuggingFace, npm, PyPI,
  DigitalOcean, Datadog, Cloudflare, Shopify, Square, database/URL connection strings,
  PEM/SSH private keys, and JWTs. All provider rules fire at `critical` severity (deny
  tier); JWTs fire at `medium` (advisory).
- **Bounded generic Shannon-entropy detector** (`secret-generic-entropy`, `low` →
  advisory). Catches unknown/internal tokens with entropy ≥ 4.5 bits/char (base64) or
  ≥ 3.0 penalised (hex) after noise filters.
- **False-positive precision package.** Automatic skip for lockfiles
  (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, etc.) and minified/map files
  (`.min.js`, `.min.css`, `.map`, `.snap`). Per-token noise filters: git SHAs, canonical
  and dashless UUIDs, base32 strings, `sha512-`/`sha384-`/`sha256-` hash tokens,
  jwt.io sample JWT, and per-line hash-context keyword gate.
- **`secrets.allowlist` in `crasp.policy.yml`.** Add literal strings or regex patterns
  to suppress specific known-safe values globally.
- **Inline `# crasp:allow` / `// crasp:allow` suppression.** Append the comment to any
  line to suppress secret findings on that line without touching the policy file.
- **Inbound confidence gate.** PostToolUse inbound scanning now only surfaces
  high-confidence provider findings (critical-severity `secret-*` rules) when
  injecting a caution into Claude's context; the generic entropy rule is not emitted
  inbound to reduce noise on untrusted external content.

### Changed

- The `token-leakage` builtin rule is superseded by the new `secret-*` rule family.
  Existing `crasp.policy.yml` files that reference `token-leakage` in exceptions or
  reports will continue to work, but new detections will surface under `secret-*` IDs.

### Known limitations / deferred

- **GCP service-account JSON** is not yet detected; the structural multi-field pattern
  has high false-positive risk and is deferred.
- **Azure Storage account keys** are not yet detected (structural/FP-prone — deferred).
- **OpenAI new-format keys** are matched only when the `T3BlbkFJ` base64 marker is
  present. This is a precision-over-recall choice: keys without the marker are not
  blocked at the deny tier to avoid false positives on legacy `sk-` prefixes.

---

## [0.1.4] - 2026-06-17

### Added

- `crasp watch` — a dependency-free live terminal dashboard that tails
  .crasp/events.ndjson and shows recent hook decisions plus running tallies
  (clean / ask / advisory / blocked / exception), updating in real time.
  `--once` renders a single snapshot; `--since <Ns|Nm|Nh|Nd|ISO>` scopes it to a
  session (invalid values are rejected). Non-TTY invocations (pipes, CI) print one
  snapshot and exit. Time is rendered in UTC for deterministic output.

---

## [0.1.3] - 2026-06-13

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

[Unreleased]: https://github.com/cristobalross29/crasp/compare/v0.2.3...HEAD
[0.2.4]: https://github.com/cristobalross29/crasp/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/cristobalross29/crasp/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/cristobalross29/crasp/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/cristobalross29/crasp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/cristobalross29/crasp/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/cristobalross29/crasp/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/cristobalross29/crasp/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/cristobalross29/crasp/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/cristobalross29/crasp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/cristobalross29/crasp/releases/tag/v0.1.0
