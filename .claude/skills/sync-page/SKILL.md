---
name: sync-page
description: Use when Crasp's version, commands, rules, or user-facing behavior changed and the landing page may be stale — after every /release, after adding/removing a rule or CLI command, or when CHANGELOG.md has an entry the page doesn't reflect yet.
---

# Skill: sync-page

The landing page lives in the sibling repo `../crasp-page` (Next.js, served at
cristobalross29.com/crasp, **auto-deploys on `git push` via Vercel**). All content is
hand-written JSX in three files — `app/page.jsx` (landing), `app/docs/page.jsx` (docs),
`app/layout.jsx` (SEO metadata) — so every CLI release drifts it. This skill re-derives
each duplicated fact from CLI source and updates the page to match.

A prior partial sync may have bumped version strings but not counts or feature copy —
"the version matches" is not evidence the page is synced. Diff every sync point.

## Sync points

| Fact on page | Where | Source of truth (CLI repo) |
| --- | --- | --- |
| Version literals (spec strip, setup-log demo, status-JSON demo — grep finds them all) | `app/page.jsx` | `package.json` `version` |
| "N+ built-in rules" claim | `app/page.jsx` hero, `app/docs/page.jsx` | count rule ids in `src/core/patterns/builtin.ts` + `src/core/scanner/secrets.ts` + `src/core/scanner/bash-rules.ts` + `src/core/scanner/inbound-rules.ts` |
| "N+ provider-grade secret matchers" + "`+N more`" chips | `app/page.jsx` secrets section | count `secret-*` ids in `src/core/scanner/secrets.ts` |
| Command names + flags | `app/docs/page.jsx` command table, panel section | `src/cli/index.ts` registry |
| Feature copy (especially the panel showcase) | `app/page.jsx` §04 + hero blurb, `app/docs/page.jsx` panel section | top entry of `CHANGELOG.md` |
| Meta title/description | `app/layout.jsx` | must name the current headline features |
| Screenshots + their alt text | `public/*.png`, `<img>` tags in `app/page.jsx` | view the PNGs; alt text can be stale even when the PNG is current |
| Install/update commands, npm/GitHub/changelog links | both pages + `app/layout.jsx` | `package.json` `name`, `repository`, `homepage` |

## Process

1. **Read the top `CHANGELOG.md` entry** (plus unreleased commits if any:
   `git log $(git describe --tags --abbrev=0)..HEAD --oneline`). This defines what changed.
2. **Re-derive every count from source.** Count **distinct rule ids**, not matcher
   entries (some ids have multiple patterns). The field name differs per file:
   ```sh
   grep -c '      id: "' src/core/patterns/builtin.ts        # rule ids (indented; the top-level policy id "crasp-builtin-security" is NOT a rule)
   grep -o 'ruleId: "secret-[a-z0-9-]*"' src/core/scanner/secrets.ts | sort -u | wc -l
   grep -o 'ruleId: "[a-z0-9-]*"' src/core/scanner/bash-rules.ts | sort -u | wc -l
   grep -o 'ruleId: "[a-z0-9-]*"' src/core/scanner/inbound-rules.ts | sort -u | wc -l
   ```
   Conventions: the "N+ built-in rules" claim rounds the total **down to the nearest 5**
   (57 → "55+"); the secrets "`+N more`" chip is `distinct secret-* ids − chips named on
   the page`. The number currently on the page is not evidence — it is the thing being checked.
3. **Find all version literals**: `grep -rn 'v\?0\.[0-9]*\.[0-9]*' app/` in the page repo,
   update hits to the released version — EXCEPT known false positives that must be left
   alone: `127.0.0.1` addresses, the docs policy example's own `version: 0.1.0`, and
   historical notes like "removed in 0.2.2".
4. **Update feature copy** touched by the release. Then check internal consistency: the
   hero blurb, the showcase caption, and the docs section must describe the same UI —
   a release that updates one and not the others has happened before.
5. **Verify every command and flag** shown on the page still exists in `src/cli/index.ts`;
   remove or update entries for renamed/removed commands.
6. **Check `app/layout.jsx`** — the meta description must mention the current headline
   features, not last release's set.
7. **Screenshots**: if the release changed the panel/UI visually, **view the PNGs in
   `public/` first** (Read them — they may already be current captures). Only ask the
   user for retakes if a PNG contradicts the new copy. Update `<img>` alt text either way.
8. **Build gate**: `npm run build` in `../crasp-page` must pass.
9. **Commit in the page repo** (it is a separate git repo): `site: sync to vX.Y.Z`.
   Ask the user before `git push` — push is deploy.

## Rules

- Counts, commands, and version strings come from CLI source files at sync time — never
  from memory and never from what the page already says.
- Work in `../crasp-page`'s own git repo; nothing here is committed to the CLI repo.
- Never push without explicit user confirmation.
