import { appendFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendHookLogEntry,
  hookLogPath,
  readHookLog,
} from "../../src/core/hook-log/index.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-hook-log-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("hookLogPath", () => {
  it("returns <root>/.agentfence/events.ndjson for a given root", () => {
    expect(hookLogPath("/my/project")).toBe(
      "/my/project/.agentfence/events.ndjson"
    );
  });

  it("defaults to process.cwd() when root is omitted", () => {
    expect(hookLogPath()).toBe(
      path.join(process.cwd(), ".agentfence", "events.ndjson")
    );
  });
});

describe("appendHookLogEntry", () => {
  it("creates the file and directory if they don't exist", async () => {
    await appendHookLogEntry("/some/file.ts", "Write", "clean", undefined, undefined, tmpDir);
    const logFile = hookLogPath(tmpDir);
    const contents = await readFile(logFile, "utf8");
    expect(contents.trim().length).toBeGreaterThan(0);
  });

  it("appends valid JSON lines (2 entries → 2 lines)", async () => {
    await appendHookLogEntry("/file1.ts", "Write", "clean", undefined, undefined, tmpDir);
    await appendHookLogEntry("/file2.ts", "Edit", "advisory", undefined, undefined, tmpDir);
    const logFile = hookLogPath(tmpDir);
    const contents = await readFile(logFile, "utf8");
    const lines = contents.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    expect(entry1.filePath).toBe("/file1.ts");
    expect(entry1.tool).toBe("Write");
    expect(entry1.outcome).toBe("clean");
    expect(entry2.filePath).toBe("/file2.ts");
    expect(entry2.tool).toBe("Edit");
    expect(entry2.outcome).toBe("advisory");
  });

  it("stores tier and ruleId when provided; omits them when not", async () => {
    await appendHookLogEntry("/file-with.ts", "Write", "denied", "high", "rule-123", tmpDir);
    await appendHookLogEntry("/file-without.ts", "Read", "clean", undefined, undefined, tmpDir);
    const logFile = hookLogPath(tmpDir);
    const contents = await readFile(logFile, "utf8");
    const lines = contents.trim().split("\n").filter(Boolean);
    const withExtra = JSON.parse(lines[0]);
    const withoutExtra = JSON.parse(lines[1]);
    expect(withExtra.tier).toBe("high");
    expect(withExtra.ruleId).toBe("rule-123");
    expect(withoutExtra.tier).toBeUndefined();
    expect(withoutExtra.ruleId).toBeUndefined();
  });

  it("never throws for an invalid root path", async () => {
    await expect(
      appendHookLogEntry("/some/file.ts", "Write", "clean", undefined, undefined, "/nonexistent/path/that/cannot/be/created/\0invalid")
    ).resolves.toBeUndefined();
  });
});

describe("readHookLog", () => {
  it("returns [] when file doesn't exist", async () => {
    const entries = await readHookLog(tmpDir);
    expect(entries).toEqual([]);
  });

  it("returns entries sorted oldest-first", async () => {
    const logFile = hookLogPath(tmpDir);
    await mkdir(path.dirname(logFile), { recursive: true });
    const now = new Date();
    const olderDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // 20 days ago
    const newerDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);  // 5 days ago
    const newer = { ts: newerDate.toISOString(), tool: "Write", filePath: "/b.ts", outcome: "clean" };
    const older = { ts: olderDate.toISOString(), tool: "Read", filePath: "/a.ts", outcome: "clean" };
    await appendFile(logFile, JSON.stringify(newer) + "\n");
    await appendFile(logFile, JSON.stringify(older) + "\n");
    const entries = await readHookLog(tmpDir);
    expect(entries[0].filePath).toBe("/a.ts");
    expect(entries[1].filePath).toBe("/b.ts");
  });

  it("skips corrupt NDJSON lines without throwing", async () => {
    const logFile = hookLogPath(tmpDir);
    await mkdir(path.dirname(logFile), { recursive: true });
    const valid = { ts: new Date().toISOString(), tool: "Write", filePath: "/ok.ts", outcome: "clean" };
    await appendFile(logFile, "this is not json\n");
    await appendFile(logFile, JSON.stringify(valid) + "\n");
    await appendFile(logFile, "{broken json\n");
    const entries = await readHookLog(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].filePath).toBe("/ok.ts");
  });

  it("filters entries older than 90 days", async () => {
    const logFile = hookLogPath(tmpDir);
    await mkdir(path.dirname(logFile), { recursive: true });
    const now = new Date();
    const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const oldDate = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000); // 91 days ago
    const recent = { ts: recentDate.toISOString(), tool: "Write", filePath: "/recent.ts", outcome: "clean" };
    const old = { ts: oldDate.toISOString(), tool: "Read", filePath: "/old.ts", outcome: "clean" };
    await appendFile(logFile, JSON.stringify(old) + "\n");
    await appendFile(logFile, JSON.stringify(recent) + "\n");
    const entries = await readHookLog(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].filePath).toBe("/recent.ts");
  });

  it("rewrites the file when prune:true and >10% entries were old", async () => {
    const logFile = hookLogPath(tmpDir);
    await mkdir(path.dirname(logFile), { recursive: true });
    const now = new Date();
    const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const oldDate1 = new Date(now.getTime() - 92 * 24 * 60 * 60 * 1000);
    const oldDate2 = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
    const old1 = { ts: oldDate1.toISOString(), tool: "Write", filePath: "/old1.ts", outcome: "clean" };
    const old2 = { ts: oldDate2.toISOString(), tool: "Write", filePath: "/old2.ts", outcome: "clean" };
    const recent = { ts: recentDate.toISOString(), tool: "Read", filePath: "/recent.ts", outcome: "clean" };
    await appendFile(logFile, JSON.stringify(old1) + "\n");
    await appendFile(logFile, JSON.stringify(old2) + "\n");
    await appendFile(logFile, JSON.stringify(recent) + "\n");
    await readHookLog(tmpDir, { prune: true });
    // Wait for the async background rewrite
    await new Promise((resolve) => setTimeout(resolve, 50));
    const contents = await readFile(logFile, "utf8");
    const lines = contents.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).filePath).toBe("/recent.ts");
  });

  it("filters by since option", async () => {
    const logFile = hookLogPath(tmpDir);
    await mkdir(path.dirname(logFile), { recursive: true });
    const now = new Date();
    const beforeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const afterSince = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);   // 5 days ago
    const sinceDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);   // 15 days ago (threshold)
    const before = { ts: beforeSince.toISOString(), tool: "Write", filePath: "/before.ts", outcome: "clean" };
    const after = { ts: afterSince.toISOString(), tool: "Read", filePath: "/after.ts", outcome: "clean" };
    await appendFile(logFile, JSON.stringify(before) + "\n");
    await appendFile(logFile, JSON.stringify(after) + "\n");
    const entries = await readHookLog(tmpDir, { since: sinceDate });
    expect(entries).toHaveLength(1);
    expect(entries[0].filePath).toBe("/after.ts");
  });
});
