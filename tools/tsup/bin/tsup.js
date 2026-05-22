#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const args = process.argv.slice(2);
const entry = args.find((arg) => !arg.startsWith("-"));
const outDirFlag = args.indexOf("--out-dir");
const outDir = outDirFlag >= 0 ? args[outDirFlag + 1] : "dist";

if (!entry) {
  console.error("tsup stub: missing entry file");
  process.exit(1);
}

if (args.includes("--watch")) {
  console.error("tsup stub: watch mode is not implemented");
  process.exit(1);
}

const cwd = process.cwd();
const entryPath = path.resolve(cwd, entry);
const entryRoot = path.dirname(entryPath);
const outputRoot = path.resolve(cwd, outDir);
const seen = new Set();

await rm(outputRoot, { force: true, recursive: true });
await compileFile(entryPath, path.join(outputRoot, "index.js"));
await writeFile(path.join(outputRoot, "index.d.ts"), "export {};\n");

async function compileFile(sourcePath, outputPath) {
  if (seen.has(sourcePath)) {
    return;
  }

  seen.add(sourcePath);

  const source = await readFile(sourcePath, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      sourceMap: false
    },
    fileName: sourcePath
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.outputText);

  const imports = parseRelativeImports(source);
  await Promise.all(
    imports.map(async (specifier) => {
      const importedSourcePath = path.resolve(
        path.dirname(sourcePath),
        specifier.replace(/\.js$/, ".ts")
      );
      const relativeToEntryRoot = path.relative(entryRoot, importedSourcePath);
      const importedOutputPath = path.join(
        outputRoot,
        relativeToEntryRoot.replace(/\.ts$/, ".js")
      );

      await compileFile(importedSourcePath, importedOutputPath);
    })
  );
}

function parseRelativeImports(source) {
  const imports = [];
  const sourceFile = ts.createSourceFile(
    "entry.ts",
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS
  );

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith(".")
    ) {
      imports.push(statement.moduleSpecifier.text);
    }
  }

  return imports;
}
