import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CLI_VERSION } from "../../src/version.js";

const CLI = path.resolve("dist/index.js");

async function makeCtx() {
  const root = await mkdtemp(path.join(os.tmpdir(), "crasp-status-"));
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  await mkdir(path.join(project, ".git"), { recursive: true });
  await mkdir(home, { recursive: true });
  return { root, project, home, bundle: path.join(home, ".crasp", "bin", "crasp.js") };
}

function run(args: string[], cwd: string, home: string) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd, encoding: "utf8", env: { ...process.env, HOME: home },
  });
}

function healthOf(stdout: string) {
  return (JSON.parse(stdout) as {
    installHealth: { ok: boolean; bundleVersion: string | null; problems: string[] };
  }).installHealth;
}

describe("status installHealth", () => {
  it("reports ok with bundle version after a successful setup", async () => {
    const ctx = await makeCtx();
    try {
      expect(run(["setup"], ctx.project, ctx.home).status).toBe(0);
      const health = healthOf(run(["status"], ctx.project, ctx.home).stdout);
      expect(health.ok).toBe(true);
      expect(health.bundleVersion).toBe(CLI_VERSION);
      expect(health.problems).toEqual([]);
    } finally { await rm(ctx.root, { recursive: true, force: true }); }
  });

  it("flags a deleted bundle with re-run remediation", async () => {
    const ctx = await makeCtx();
    try {
      run(["setup"], ctx.project, ctx.home);
      await rm(ctx.bundle);
      const health = healthOf(run(["status"], ctx.project, ctx.home).stdout);
      expect(health.ok).toBe(false);
      expect(health.problems.join(" ")).toContain("re-run: npx @crasp/cli setup");
    } finally { await rm(ctx.root, { recursive: true, force: true }); }
  });

  it("flags dead node paths in hooks AND in the git pre-commit hook", async () => {
    const ctx = await makeCtx();
    try {
      run(["setup"], ctx.project, ctx.home);
      for (const rel of [".claude/settings.json", ".git/hooks/pre-commit"]) {
        const p = path.join(ctx.project, rel);
        await writeFile(p, (await readFile(p, "utf8")).replaceAll(process.execPath, "/gone/node"));
      }
      const health = healthOf(run(["status"], ctx.project, ctx.home).stdout);
      expect(health.ok).toBe(false);
      const joined = health.problems.join(" ");
      expect(joined).toContain("/gone/node");
      expect(joined).toContain("pre-commit");
    } finally { await rm(ctx.root, { recursive: true, force: true }); }
  });

  it("flags a legacy bare-name crasp hook as stale", async () => {
    const ctx = await makeCtx();
    try {
      run(["setup"], ctx.project, ctx.home);
      const settingsPath = path.join(ctx.project, ".claude", "settings.json");
      const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
        hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> };
      };
      settings.hooks.PreToolUse.push({
        matcher: "Edit",
        hooks: [{ type: "command", command: "crasp check --hook-input Edit" }],
      });
      await writeFile(settingsPath, JSON.stringify(settings));
      const health = healthOf(run(["status"], ctx.project, ctx.home).stdout);
      expect(health.ok).toBe(false);
      expect(health.problems.join(" ")).toContain("legacy crasp hook");
    } finally { await rm(ctx.root, { recursive: true, force: true }); }
  });

  it("does not false-positive on foreign hooks with quoted words", async () => {
    const ctx = await makeCtx();
    try {
      run(["setup"], ctx.project, ctx.home);
      const settingsPath = path.join(ctx.project, ".claude", "settings.json");
      const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
        hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> };
      };
      settings.hooks.PreToolUse.push({
        matcher: "Write",
        hooks: [{ type: "command", command: 'echo "done" && my-formatter --fix' }],
      });
      await writeFile(settingsPath, JSON.stringify(settings));
      const health = healthOf(run(["status"], ctx.project, ctx.home).stdout);
      expect(health.ok).toBe(true);
    } finally { await rm(ctx.root, { recursive: true, force: true }); }
  });

  it("flags a legacy managed pre-commit hook without CRASP_NODE/CRASP_BIN", async () => {
    const ctx = await makeCtx();
    try {
      run(["setup"], ctx.project, ctx.home);
      const hookPath = path.join(ctx.project, ".git", "hooks", "pre-commit");
      await writeFile(
        hookPath,
        "#!/usr/bin/env sh\n# managed-by: crasp\n\nexec crasp check --staged\n"
      );
      const health = healthOf(run(["status"], ctx.project, ctx.home).stdout);
      expect(health.ok).toBe(false);
      expect(health.problems.join(" ")).toContain("legacy format");
    } finally { await rm(ctx.root, { recursive: true, force: true }); }
  });

  it("status re-registers a healthy project in ~/.crasp/projects.json", async () => {
    const ctx = await makeCtx();
    try {
      expect(run(["setup"], ctx.project, ctx.home).status).toBe(0);
      await rm(path.join(ctx.home, ".crasp", "projects.json"), { force: true });
      expect(run(["status"], ctx.project, ctx.home).status).toBe(0);
      const raw = await readFile(path.join(ctx.home, ".crasp", "projects.json"), "utf8");
      const entries = JSON.parse(raw) as Array<{ path: string }>;
      const { realpath } = await import("node:fs/promises");
      expect(entries.map((e) => e.path)).toContain(await realpath(ctx.project));
    } finally { await rm(ctx.root, { recursive: true, force: true }); }
  });

  it("reports an unreadable pre-commit hook instead of crashing", async () => {
    const ctx = await makeCtx();
    try {
      run(["setup"], ctx.project, ctx.home);
      const hookPath = path.join(ctx.project, ".git", "hooks", "pre-commit");
      await chmod(hookPath, 0o000);
      const result = run(["status"], ctx.project, ctx.home);
      expect(result.status).toBe(0);
      const health = healthOf(result.stdout);
      expect(health.ok).toBe(false);
      expect(health.problems.join(" ")).toContain("pre-commit hook is unreadable");
    } finally {
      await rm(ctx.root, { recursive: true, force: true });
    }
  });
});
