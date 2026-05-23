# npm Publish Checklist

Use this checklist before publishing `agentfence` to npm.

## Registry And Naming

- `npm view agentfence name version description --json` returned `E404` on
  2026-05-23, so the exact npm package name appeared available at that time.
- There is an existing PyPI package and GitHub organization using the
  AgentFence name. Decide whether the first npm release should stay unscoped as
  `agentfence` or move to a scoped package before publishing.

## Preflight

- Confirm the working tree is clean: `git status --short`.
- Confirm the version in `package.json` matches the intended release.
- Confirm the CLI version in `src/cli/index.ts` matches `package.json`.
- Confirm `README.md`, `LICENSE`, package metadata, and repository links are
  current.
- Confirm no secrets or local artifacts are staged.

## Validation

Run:

```sh
pnpm release:check
npm publish --dry-run
```

This runs:

```sh
pnpm build
pnpm test
pnpm typecheck
npm pack --dry-run
```

Expected tarball contents for `agentfence@0.1.0`:

- `LICENSE`
- `README.md`
- `dist/index.js`
- `dist/index.d.ts`
- `package.json`

`npm publish --dry-run` should complete without npm auto-correcting package
metadata. If npm reports cache permission errors, fix the local npm cache or run
the release from a clean environment before publishing.

## Publish

1. Authenticate with npm using an account that has 2FA enabled.
2. Re-run `pnpm release:check` from a clean working tree.
3. Publish:

   ```sh
   npm publish
   ```

4. Verify the release:

   ```sh
   npm view agentfence version
   npm exec agentfence -- --help
   ```

Prefer publishing from CI with npm provenance once the repository has a release
workflow and an npm automation token.
