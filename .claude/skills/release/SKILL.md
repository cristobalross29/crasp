---
name: release
description: Cut a versioned Crasp release — bump the version, run the full build/test/typecheck gate plus an npm pack dry-run, update CHANGELOG.md, then commit "chore: release vX.Y.Z" and tag. User-invoked only; never run automatically.
disable-model-invocation: true
---

# Skill: release

Cut a versioned release of Crasp the way this repo already does it (`chore: release vX.Y.Z` commits + `vX.Y.Z` tags). This skill is **user-invoked only** — it commits, tags, and prepares to publish, so it never runs on its own.

## When this skill is invoked

The user types `/release` optionally followed by the bump kind or explicit version:
- `/release patch` — 0.1.4 → 0.1.5 (default if unspecified)
- `/release minor` — 0.1.4 → 0.2.0
- `/release 0.2.0` — set an explicit version

## Steps

1. **Confirm a clean starting point**:
   ```sh
   git status --porcelain     # must be empty
   git rev-parse --abbrev-ref HEAD
   ```
   If the working tree is dirty, stop and tell the user to commit or stash first. Confirm the branch is the intended release branch (usually `main`).

2. **Determine the new version** — Read the current version from `package.json` (currently the source of truth). Apply the requested bump, or use the explicit version given. Confirm the resulting version string with the user before changing anything.

3. **Run the full gate** — This is the same gate as `prepublishOnly`, plus the pack dry-run from `release:check`:
   ```sh
   pnpm build && pnpm test && pnpm typecheck
   pnpm release:check        # prepublishOnly + npm pack --dry-run
   ```
   If anything fails, stop and report. Do not bump or commit a broken build.

4. **Bump the version** — Update the `version` field in `package.json` AND `CLI_VERSION` in `src/version.ts` to the new version (they must match — `tests/cli/version.test.ts` enforces it, and `installBundle`'s version compare breaks on a mismatch). Do not run `npm version` (it creates its own commit/tag with a different message shape); edit the fields directly to keep the repo's `chore: release vX.Y.Z` convention.

5. **Update CHANGELOG.md** — Add a new section at the top for the new version. Summarize what changed since the last release by reading the commits:
   ```sh
   git log $(git describe --tags --abbrev=0)..HEAD --oneline
   ```
   Group entries into Added / Changed / Fixed. Keep it human-readable; match the existing CHANGELOG formatting, **including the compare link** at the bottom of the file (`[X.Y.Z]: https://github.com/cristobalross29/crasp/compare/vPREV...vX.Y.Z`).

6. **Commit and tag** — Match the existing convention exactly:
   ```sh
   git add package.json src/version.ts CHANGELOG.md
   git commit -m "chore: release v<new-version>"
   git tag v<new-version>
   ```

7. **Report and hand off** — Show the user the commit and tag, then state the remaining manual steps explicitly (do NOT do these automatically):
   ```sh
   git push && git push --tags
   npm publish        # or pnpm publish
   ```
   Ask the user to confirm before any push or publish.

8. **Sync the landing page** — After the release commit, invoke the `sync-page` skill:
   `../crasp-page` duplicates the version, rule counts, and feature copy, and every
   release drifts it. A release is not finished until the page reflects it.

## Rules

- Never run automatically — this skill is `disable-model-invocation: true` for a reason. Only act on an explicit `/release`.
- Never bump or commit on a failing gate. Build + test + typecheck must be green first.
- Never `git push` or `npm publish` without explicit user confirmation — leave those as the final manual step.
- Keep the exact existing conventions: `chore: release vX.Y.Z` commit message and `vX.Y.Z` tag.
- Do not commit the gitignored files (`.crasp/`, `dist/`, `.mcp.json`, `.claude/settings*.json`) — only `package.json` and `CHANGELOG.md` (and any genuine source changes the user already staged).
- The working tree must be clean before starting; a release commit should contain only the version bump and changelog.
