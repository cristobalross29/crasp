import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CLI_VERSION } from "../../src/version.js";

const CLI = path.resolve("dist/index.js");

describe("version single-source", () => {
  it("CLI --version, CLI_VERSION, and package.json version all agree", async () => {
    const pkg = JSON.parse(
      await readFile(path.resolve("package.json"), "utf8")
    ) as { version: string };
    expect(CLI_VERSION).toBe(pkg.version);
    const result = spawnSync(process.execPath, [CLI, "--version"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(CLI_VERSION);
  });

  it("no source file hardcodes the old version strings", async () => {
    for (const file of ["src/cli/index.ts", "src/mcp/server.ts"]) {
      const content = await readFile(path.resolve(file), "utf8");
      expect(content).not.toMatch(/"0\.\d+\.\d+"/);
    }
  });
});
