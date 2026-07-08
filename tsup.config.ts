import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/index.ts"],
  format: ["esm"],
  dts: false,
  outDir: "dist",
  clean: true,
  noExternal: [/.*/],
  // installHook's dynamic `import("./setup.js")` (avoids a circular import)
  // must not fragment the bundle: resolveInstalledBundle() copies dist/index.js
  // alone, so a split-off chunk file would be missing wherever it lands.
  splitting: false,
  banner: {
    // CJS deps bundled into ESM need a require shim, or the bundle throws
    // "Dynamic require of 'fs' is not supported" at runtime.
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
});
