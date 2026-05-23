import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { handleScan } from "../../src/mcp/tools/scan.js";
import type { Policy } from "../../src/types/index.js";

const TEST_POLICY: Policy = {
  id: "test",
  name: "Test Policy",
  rules: [
    {
      id: "token-leakage",
      description: "Sensitive token detected",
      severity: "critical",
      pattern: "sk-[a-z0-9]{20,}",
      target: "any",
    },
  ],
};

describe("handleScan", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-scan-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns allow for a clean file", async () => {
    const filePath = path.join(tmpDir, "clean.ts");
    await writeFile(filePath, "export const greeting = 'hello';");
    const result = await handleScan({ path: filePath }, TEST_POLICY);
    expect(result.action).toBe("allow");
    expect(result.summary.totalMatches).toBe(0);
    expect(result.scanErrors).toHaveLength(0);
  });

  it("returns block for a file with a critical violation", async () => {
    const filePath = path.join(tmpDir, "secrets.env");
    await writeFile(filePath, "API_KEY=sk-abcdefghijklmnopqrstu");
    const result = await handleScan({ path: filePath }, TEST_POLICY);
    expect(result.action).toBe("block");
    expect(result.summary.totalMatches).toBeGreaterThan(0);
  });

  it("scans a directory recursively by default", async () => {
    const subDir = path.join(tmpDir, "sub");
    await mkdir(subDir, { recursive: true });
    await writeFile(
      path.join(subDir, "leak.env"),
      "API_KEY=sk-abcdefghijklmnopqrstu"
    );
    await writeFile(path.join(tmpDir, "clean.ts"), "const x = 1;");
    const result = await handleScan({ path: tmpDir }, TEST_POLICY);
    expect(result.summary.totalFiles).toBeGreaterThanOrEqual(2);
    expect(result.summary.totalMatches).toBeGreaterThan(0);
  });

  it("respects recursive=false", async () => {
    const subDir = path.join(tmpDir, "sub");
    await mkdir(subDir, { recursive: true });
    await writeFile(
      path.join(subDir, "leak.env"),
      "API_KEY=sk-abcdefghijklmnopqrstu"
    );
    const result = await handleScan(
      { path: tmpDir, recursive: false },
      TEST_POLICY
    );
    expect(result.summary.totalMatches).toBe(0);
  });

  it("exposes scanErrors array in result", async () => {
    const filePath = path.join(tmpDir, "clean.ts");
    await writeFile(filePath, "const x = 1;");
    const result = await handleScan({ path: filePath }, TEST_POLICY);
    expect(Array.isArray(result.scanErrors)).toBe(true);
  });
});
