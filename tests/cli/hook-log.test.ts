import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("dist/index.js");

function makeEntry(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    tool: "Write",
    filePath: "src/index.ts",
    outcome: "clean",
    ...overrides,
  });
}

async function makeLogDir(tmpDir: string, lines: string[]): Promise<void> {
  const logDir = path.join(tmpDir, ".crasp");
  await mkdir(logDir, { recursive: true });
  await writeFile(path.join(logDir, "events.ndjson"), lines.join("\n") + "\n");
}

describe("hook-log command", () => {
  it("empty log → status 0, stdout contains 'No activity recorded yet'", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-hook-log-empty-"));
    try {
      await makeLogDir(tmpDir, []);
      const result = spawnSync("node", [CLI, "hook-log"], {
        cwd: tmpDir,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("No activity recorded yet");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("today's entries → shows ✓ icon for clean entry", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-hook-log-today-"));
    try {
      await makeLogDir(tmpDir, [
        makeEntry({ outcome: "clean", filePath: "src/index.ts" }),
      ]);
      const result = spawnSync("node", [CLI, "hook-log"], {
        cwd: tmpDir,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("✓");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("--json → each entry emitted as valid JSON line, correct count", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-hook-log-json-"));
    try {
      await makeLogDir(tmpDir, [
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "denied", ruleId: "rule-1" }),
        makeEntry({ outcome: "advisory" }),
      ]);
      const result = spawnSync("node", [CLI, "hook-log", "--json"], {
        cwd: tmpDir,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(3);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("--summary → contains '30 days', '3 total', '1 blocked', '1 asks'; does NOT contain ✓", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-hook-log-summary-"));
    try {
      await makeLogDir(tmpDir, [
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "denied", ruleId: "rule-1" }),
        makeEntry({ outcome: "ask" }),
      ]);
      const result = spawnSync("node", [CLI, "hook-log", "--summary"], {
        cwd: tmpDir,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("30 days");
      expect(result.stdout).toContain("3 total");
      expect(result.stdout).toContain("1 blocked");
      expect(result.stdout).toContain("1 asks");
      expect(result.stdout).not.toContain("✓");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("--prune → status 0, stdout contains 'Pruned'", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-hook-log-prune-"));
    try {
      // Put some old entries (>90 days) to trigger pruning
      const oldDate = new Date(Date.now() - 92 * 24 * 60 * 60 * 1000);
      const oldDate2 = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000);
      await makeLogDir(tmpDir, [
        makeEntry({ ts: oldDate.toISOString(), outcome: "clean" }),
        makeEntry({ ts: oldDate2.toISOString(), outcome: "clean" }),
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "clean" }),
      ]);
      const result = spawnSync("node", [CLI, "hook-log", "--prune"], {
        cwd: tmpDir,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Pruned");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("default view → shows 'Last 30 days' footer and '2 total'", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-hook-log-default-"));
    try {
      await makeLogDir(tmpDir, [
        makeEntry({ outcome: "clean" }),
        makeEntry({ outcome: "advisory" }),
      ]);
      const result = spawnSync("node", [CLI, "hook-log"], {
        cwd: tmpDir,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Last 30 days");
      expect(result.stdout).toContain("2 total");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("denied entry → stdout contains 🛡 and 'BLOCKED'", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-hook-log-denied-"));
    try {
      await makeLogDir(tmpDir, [
        makeEntry({ outcome: "denied", ruleId: "rule-secret" }),
      ]);
      const result = spawnSync("node", [CLI, "hook-log"], {
        cwd: tmpDir,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("🛡");
      expect(result.stdout).toContain("BLOCKED");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
