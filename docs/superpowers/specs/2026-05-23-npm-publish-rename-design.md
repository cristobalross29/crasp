# npm Publish Fix: Rename to @cristobalross29/crasp

**Date:** 2026-05-23
**Status:** Approved

## Problem

`npm publish` rejected the unscoped name `crasp` with a 403 error:

> Package name too similar to existing package `case`; try renaming your package to `@cristobalross29/crasp` and publishing with `npm publish --access=public`.

## Solution

Scope the package as `@cristobalross29/crasp` and publish with `--access=public`. The CLI binary name (`crasp`) is independent of the npm package name and does not change.

## Approach

Option A: scope the package, update all documentation to match the scoped name, and rewrite the README to a professional standard matching top open-source CLI projects.

Rejected alternatives:
- Option B (keep `npx crasp` wording): a footgun — `npx crasp` without a local install would pull the unrelated `case` package.
- Option C (npm dispute): blocks publication today, uncertain outcome.

## File Changes

### 1. `package.json`

One field only:

```diff
- "name": "crasp",
+ "name": "@cristobalross29/crasp",
```

Everything else (bin, types, files, repository, engines, scripts) is unchanged. The `bin` field stays `"crasp": "dist/index.js"` — the CLI command name is not affected.

### 2. `README.md` — Full Professional Rewrite

Structure (OpenClaw-inspired: branding → value prop → install → features → reference → dev):

| Section | Contents |
|---|---|
| Header | `# Crasp` + one-line tagline. Shields: npm version, MIT license, Node ≥18. |
| Intro | 2–3 sentence value prop. What it solves, who it's for. No filler. |
| What It Does | Bold-header bullet list of 8 capabilities. |
| Install | Three tiers: `npx @cristobalross29/crasp` (quick try), `--save-dev` (project/CI), `-g` (global). |
| Quick Start | 4–5 commands: setup → run scenario → scan → check staged. |
| Scenarios | YAML example + expectation types table. |
| Policies | YAML example + merge behavior note. |
| Built-In Rules | Table of all 10 rule categories. |
| CLI Reference | Command table. |
| Hooks | PreToolUse + hook-log commands. |
| Reports | Run lifecycle commands. |
| MCP | `crasp mcp` section. |
| Development | Build/test/typecheck + `pnpm link --global`. |
| License | MIT. |

Tone: direct, technical, no filler. Every command copy-pasteable.

### 3. `docs/npm-publish-checklist.md`

Update all package name references:

| Before | After |
|---|---|
| `npm view crasp name version description --json` | `npm view @cristobalross29/crasp name version description --json` |
| E404 note referencing unscoped `crasp` | Updated to reflect scoped `@cristobalross29/crasp` |
| `crasp@0.1.0` tarball label | `@cristobalross29/crasp@0.1.0` |
| `npm publish` | `npm publish --access=public` |
| `npm view crasp version` | `npm view @cristobalross29/crasp version` |
| `npm exec crasp -- --help` | `npx @cristobalross29/crasp --help` |

### 4. Publish Command

```sh
npm publish --access=public
```

`--access=public` is required for all scoped packages. Without it, npm defaults to `--access=restricted` and rejects the publish unless the account has a paid org plan.

## What Does NOT Change

- `bin` field: `"crasp": "dist/index.js"` — CLI command stays `crasp`
- All `src/` TypeScript files
- All `tests/`
- `AGENTS.md` — references `crasp` as a CLI command, not a package name
- `.claude/CLAUDE.md` and all skill files — same reason
- `package.json` scripts, dependencies, engines, repository fields

## Self-Review

- No placeholder sections or TBDs.
- Package name change is consistent across all three files — no file references the old unscoped name after the edit.
- Install instructions are safe: `npx @cristobalross29/crasp` correctly targets the scoped package (no footgun from the `case` package collision).
- `--access=public` is present on every mention of the publish command.
- README rewrite scope is bounded: it rewrites the one existing README, does not create new docs.
- No contradictions between sections.
