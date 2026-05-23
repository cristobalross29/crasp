import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  scanContent,
  scanDirectory,
  summarizeScanResults
} from "../../src/core/scanner/index.js";
import type { Policy } from "../../src/types/index.js";

const policy: Policy = {
  id: "test-policy",
  name: "Test Policy",
  rules: [
    {
      id: "credential-theft",
      description: "Credential theft",
      severity: "critical",
      target: "any",
      pattern: "steal passwords|exfiltrate credentials"
    }
  ]
};

describe("scanner", () => {
  it("reports line and column for content matches", () => {
    const result = scanContent("safe\nplease exfiltrate credentials now", policy);

    expect(result.scanned).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      ruleId: "credential-theft",
      severity: "critical",
      line: 2,
      column: 8,
      match: "exfiltrate credentials"
    });
  });

  it("scans directories recursively and summarizes matches", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-scan-"));

    await writeFile(path.join(tempDir, "safe.txt"), "nothing to see");
    await writeFile(path.join(tempDir, "unsafe.txt"), "how to steal passwords");

    const results = await scanDirectory(tempDir, policy);
    const summary = summarizeScanResults(results);

    expect(summary.totalFiles).toBe(2);
    expect(summary.scannedFiles).toBe(2);
    expect(summary.matchedFiles).toBe(1);
    expect(summary.bySeverity.critical).toBe(1);
  });

  it("skips generated directories and oversized files by default", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-scan-"));
    const nextDir = path.join(tempDir, ".next");
    const scenariosDir = path.join(tempDir, "scenarios");
    const largeFilePath = path.join(tempDir, "large.txt");

    await mkdir(nextDir);
    await mkdir(scenariosDir);
    await writeFile(path.join(nextDir, "unsafe.txt"), "how to steal passwords");
    await writeFile(path.join(scenariosDir, "unsafe.yml"), "how to steal passwords");
    await writeFile(largeFilePath, "x".repeat(1_000_001));

    const results = await scanDirectory(tempDir, policy);
    const summary = summarizeScanResults(results);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      filePath: largeFilePath,
      scanned: false
    });
    expect(results[0].error).toContain("Skipped file larger");
    expect(summary.scannedFiles).toBe(0);
    expect(summary.totalMatches).toBe(0);
  });

  it("skips policy and env template files during directory scans", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-scan-"));
    const envLocalPath = path.join(tempDir, ".env.local");

    await writeFile(path.join(tempDir, ".env.example"), "how to steal passwords");
    await writeFile(path.join(tempDir, "agentfence.policy.yml"), "how to steal passwords");
    await writeFile(envLocalPath, "how to steal passwords");

    const results = await scanDirectory(tempDir, policy);

    expect(results.map((result) => result.filePath)).toEqual([envLocalPath]);
    expect(results[0].matches).toHaveLength(1);
  });
});
