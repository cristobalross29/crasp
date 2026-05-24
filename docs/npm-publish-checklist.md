# npm Publish Checklist

Use this checklist before publishing `@cristobalross29/crasp` to npm.

## Registry And Naming

- Package is scoped as `@cristobalross29/crasp` following npm's recommendation
  after the unscoped name `crasp` was rejected for similarity to the existing
  `case` package (403 returned on 2026-05-23).
- All public references (README, docs) use the scoped name.
- Scoped packages require `npm publish --access=public` for public visibility.

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
npm publish --dry-run --access=public
```

This runs:

```sh
pnpm build
pnpm test
pnpm typecheck
npm pack --dry-run
```

Expected tarball contents for `@cristobalross29/crasp@0.1.0`:

- `LICENSE`
- `README.md`
- `dist/index.js`
- `dist/index.d.ts`
- `package.json`

`npm publish --dry-run --access=public` should complete without npm
auto-correcting package metadata. If npm reports cache permission errors,
fix the local npm cache or run the release from a clean environment before
publishing.

## Publish

1. Authenticate with npm using an account that has 2FA enabled.
2. Re-run `pnpm release:check` from a clean working tree.
3. Publish:

   ```sh
   npm publish --access=public
   ```

4. Verify the release:

   ```sh
   npm view @cristobalross29/crasp version
   npx @cristobalross29/crasp --help
   ```

Prefer publishing from CI with npm provenance once the repository has a release
workflow and an npm automation token.
