import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("dist/index.js");

function entryLine(o: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    tool: "Write",
    filePath: "src/index.ts",
    outcome: "clean",
    ...o,
  });
}

async function seed(tmp: string, lines: string[]): Promise<void> {
  await mkdir(path.join(tmp, ".crasp"), { recursive: true });
  await writeFile(path.join(tmp, ".crasp", "events.ndjson"), lines.join("\n") + (lines.length ? "\n" : ""));
}

function run(tmp: string, args: string[]) {
  // spawnSync stdout is a pipe (not a TTY) → snapshot path; never the live loop.
  return spawnSync("node", [CLI, "watch", ...args], { cwd: tmp, encoding: "utf8", timeout: 10_000 });
}

describe("crasp watch", () => {
  it("--once renders one frame for seeded entries and exits 0", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-once-"));
    try {
      await seed(tmp, [
        entryLine({ outcome: "clean", filePath: "src/index.ts" }),
        entryLine({ tool: "Bash", filePath: "rm -rf build", outcome: "ask", ruleId: "bash-rm-rf" }),
        entryLine({ outcome: "denied", filePath: "src/secrets.ts", ruleId: "token-leakage" }),
      ]);
      const r = run(tmp, ["--once"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("watching");
      expect(r.stdout).toContain("rm -rf build");
      expect(r.stdout).toContain("BLOCKED");
      expect(r.stdout).toContain("1 ask");
      expect(r.stdout).toContain("1 blocked");
      // snapshot is plain text (color:false ⇒ no ANSI SGR codes)
      expect(/\x1b\[[0-9;]*m/.test(r.stdout)).toBe(false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("non-TTY (no --once) prints a snapshot + notice on stderr, exits 0", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-pipe-"));
    try {
      await seed(tmp, [entryLine({ outcome: "clean" })]);
      const r = run(tmp, []);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain("not a TTY");
      expect(r.stdout).toContain("watching");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("empty log → placeholder, exit 0", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-empty-"));
    try {
      await seed(tmp, []);
      const r = run(tmp, ["--once"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("No activity yet");
      expect(r.stdout).toContain("0 clean");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("missing .crasp/ → placeholder, exit 0 (no crash)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-missing-"));
    try {
      const r = run(tmp, ["--once"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("No activity yet");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("valid relative --since filters out older entries", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-since-"));
    try {
      const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
      await seed(tmp, [
        entryLine({ ts: old, outcome: "clean", filePath: "src/old.ts" }),
        entryLine({ outcome: "clean", filePath: "src/new.ts" }),
      ]);
      const r = run(tmp, ["--once", "--since", "1h"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("src/new.ts");
      expect(r.stdout).not.toContain("src/old.ts");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("valid ISO --since is accepted", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-iso-"));
    try {
      await seed(tmp, [entryLine({ outcome: "clean", filePath: "src/new.ts" })]);
      const r = run(tmp, ["--once", "--since", "2020-01-01T00:00:00.000Z"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("src/new.ts");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("invalid --since → stderr message + non-zero exit (E6)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-badsince-"));
    try {
      await seed(tmp, [entryLine({ outcome: "clean" })]);
      for (const bad of ["30min", "garbage", "0m", "999999999d"]) {
        const r = run(tmp, ["--once", "--since", bad]);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain(`invalid --since: ${bad}`);
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("invalid --interval warns and still runs (E9)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-badint-"));
    try {
      await seed(tmp, [entryLine({ outcome: "clean" })]);
      // non-TTY snapshot path doesn't use the interval, but parsing must not crash.
      const r = run(tmp, ["--once", "--interval", "abc"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("watching");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
