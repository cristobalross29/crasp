# npm Publish Checklist

Use this checklist before publishing `crasp` to npm.

## Registry And Naming

- `npm view crasp name version description --json` returned `E404` on
  2026-05-23, so the exact npm package name appeared available at that time.
- Public web search found older acronym/scientific uses of CRASP, but did not
  surface an active AI-security product using `crasp`. This is not legal advice;
  confirm trademark comfort before publishing.

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

Expected tarball contents for `crasp@0.1.0`:

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
   npm view crasp version
   npm exec crasp -- --help
   ```

Prefer publishing from CI with npm provenance once the repository has a release
workflow and an npm automation token.
