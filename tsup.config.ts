import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli/index.ts"],
  format: ["esm"],
  dts: false,
  outDir: "dist",
  clean: true,
  noExternal: [/.*/],
  banner: {
    // CJS deps bundled into ESM need a require shim, or the bundle throws
    // "Dynamic require of 'fs' is not supported" at runtime.
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
});
