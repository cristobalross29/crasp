import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendHookLogEntry, hookLogPath } from "../../src/core/hook-log/index.js";

let dir: string | null = null;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe("appendHookLogEntry phase", () => {
  it("writes a phase field and accepts a web tool name", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "crasp-phase-"));
    await appendHookLogEntry(
      "https://x.com", "WebFetch", "inbound-flagged", undefined, "prompt-injection", dir, "post"
    );
    const raw = await readFile(hookLogPath(dir), "utf8");
    const entry = JSON.parse(raw.trim());
    expect(entry.phase).toBe("post");
    expect(entry.outcome).toBe("inbound-flagged");
    expect(entry.tool).toBe("WebFetch");
    expect(entry.ruleId).toBe("prompt-injection");
  });

  it("omits phase when not provided (existing pre entries stay valid)", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "crasp-phase-"));
    await appendHookLogEntry("src/x.ts", "Write", "clean", undefined, undefined, dir);
    const raw = await readFile(hookLogPath(dir), "utf8");
    const entry = JSON.parse(raw.trim());
    expect(entry.phase).toBeUndefined();
    expect(entry.tool).toBe("Write");
  });
});
