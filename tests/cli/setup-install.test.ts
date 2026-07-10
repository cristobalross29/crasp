import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CLI_VERSION } from "../../src/version.js";
import { shq } from "../../src/core/install/index.js";

const CLI = path.resolve("dist/index.js");

export interface Ctx { project: string; home: string; bundle: string }

export async function makeCtx(): Promise<Ctx> {
  const root = await mkdtemp(path.join(os.tmpdir(), "crasp-setup-"));
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  return { project, home, bundle: path.join(home, ".crasp", "bin", "crasp.js") };
}

export function runSetup(ctx: Ctx, args: string[] = []) {
  return spawnSync(process.execPath, [CLI, "setup", ...args], {
    cwd: ctx.project,
    encoding: "utf8",
    env: { ...process.env, HOME: ctx.home },
  });
}

export async function cleanup(ctx: Ctx) {
  await rm(path.dirname(ctx.project), { recursive: true, force: true });
}

export function expectedCommand(bundle: string, args: string): string {
  return `N=${shq(process.execPath)}; [ -x "$N" ] || N="$(command -v node || true)"; exec "$N" ${shq(bundle)} ${args}`;
}

describe("setup installs bundle and wires self-healing absolute-path hooks", () => {
  it("copies the bundle to ~/.crasp/bin/crasp.js and it runs", async () => {
    const ctx = await makeCtx();
    try {
      const result = runSetup(ctx);
      expect(result.status).toBe(0);
      await access(ctx.bundle);
      const v = spawnSync(process.execPath, [ctx.bundle, "--version"], { encoding: "utf8" });
      expect(v.stdout.trim()).toBe(CLI_VERSION);
    } finally { await cleanup(ctx); }
  });

  it("bundle runs even when a typeless package.json exists above ~/.crasp", async () => {
    // Real-world failure: ~/package.json without "type" makes Node load the
    // ESM bundle as CJS ("Cannot use import statement outside a module").
    // Node 22+ syntax detection hides this whenever no ancestor package.json
    // exists, which is why plain temp-home tests never caught it.
    const ctx = await makeCtx();
    try {
      await writeFile(path.join(ctx.home, "package.json"), '{"name":"home","version":"1.0.0"}\n');
      const result = runSetup(ctx);
      expect(result.status).toBe(0);
      const marker = JSON.parse(
        await readFile(path.join(path.dirname(ctx.bundle), "package.json"), "utf8")
      ) as { type?: string };
      expect(marker.type).toBe("module");
      const v = spawnSync(process.execPath, [ctx.bundle, "--version"], { encoding: "utf8" });
      expect(v.stdout.trim()).toBe(CLI_VERSION);
    } finally { await cleanup(ctx); }
  });

  it("registers the project in ~/.crasp/projects.json", async () => {
    const ctx = await makeCtx();
    try {
      const result = runSetup(ctx);
      expect(result.status).toBe(0);
      const raw = await readFile(path.join(ctx.home, ".crasp", "projects.json"), "utf8");
      const entries = JSON.parse(raw) as Array<{ path: string; registeredAt: string }>;
      // realpath both sides: mkdtemp on macOS returns /var/... while the
      // registry stores the resolved /private/var/... path
      const { realpath } = await import("node:fs/promises");
      expect(entries.map((e) => e.path)).toContain(await realpath(ctx.project));
    } finally { await cleanup(ctx); }
  });

  it("writes canonical pre and post hook commands", async () => {
    const ctx = await makeCtx();
    try {
      runSetup(ctx);
      const settings = JSON.parse(
        await readFile(path.join(ctx.project, ".claude", "settings.json"), "utf8")
      ) as {
        hooks: {
          PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }>;
          PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }>;
        };
      };
      for (const tool of ["Write", "Edit", "Read", "Bash"]) {
        const entry = settings.hooks.PreToolUse.find((h) => h.matcher === tool);
        expect(entry?.hooks[0]?.command).toBe(
          expectedCommand(ctx.bundle, `check --hook-input ${tool}`)
        );
      }
      for (const tool of ["Read", "Bash", "WebFetch", "WebSearch"]) {
        const entry = settings.hooks.PostToolUse.find((h) => h.matcher === tool);
        expect(entry?.hooks[0]?.command).toBe(
          expectedCommand(ctx.bundle, `check --hook-input ${tool} --post`)
        );
      }
    } finally { await cleanup(ctx); }
  });

  it("the written hook command actually works through /bin/sh", async () => {
    const ctx = await makeCtx();
    try {
      runSetup(ctx);
      const settings = JSON.parse(
        await readFile(path.join(ctx.project, ".claude", "settings.json"), "utf8")
      ) as { hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> } };
      const command = settings.hooks.PreToolUse.find((h) => h.matcher === "Write")!.hooks[0].command;
      const fakeKey = "AKIA" + "ABCDEFGHIJKLMNOP";
      const payload = JSON.stringify({
        tool_input: { file_path: "x.ts", content: `const k = "${fakeKey}";` },
      });
      const result = spawnSync("/bin/sh", ["-c", command], {
        input: payload, encoding: "utf8", cwd: ctx.project,
      });
      expect(result.status).toBe(0);
      const out = JSON.parse(result.stdout.trim()) as {
        hookSpecificOutput?: { permissionDecision?: string };
      };
      expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
    } finally { await cleanup(ctx); }
  });

  it("writes .mcp.json in array form with absolute paths", async () => {
    const ctx = await makeCtx();
    try {
      runSetup(ctx);
      const mcp = JSON.parse(
        await readFile(path.join(ctx.project, ".mcp.json"), "utf8")
      ) as { mcpServers: { crasp: { type: string; command: string; args: string[] } } };
      expect(mcp.mcpServers.crasp).toEqual({
        type: "stdio",
        command: process.execPath,
        args: [ctx.bundle, "mcp"],
      });
    } finally { await cleanup(ctx); }
  });

  it("is idempotent — second run hits the skip gate and changes nothing", async () => {
    const ctx = await makeCtx();
    try {
      runSetup(ctx);
      const before = await readFile(path.join(ctx.project, ".claude", "settings.json"), "utf8");
      const second = runSetup(ctx);
      expect(second.status).toBe(0);
      // Not vacuous: the skip line only prints when the early-return gate is
      // actually reachable (guards the isCanonicalPostHook quoting bug).
      expect(second.stdout).toContain("Skipped .claude/settings.json hooks (already installed)");
      const after = await readFile(path.join(ctx.project, ".claude", "settings.json"), "utf8");
      expect(after).toBe(before);
    } finally { await cleanup(ctx); }
  });

  it("migrates stale bare-name and old-absolute-path crasp hooks", async () => {
    const ctx = await makeCtx();
    try {
      const claudeDir = path.join(ctx.project, ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(
        path.join(claudeDir, "settings.json"),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              { matcher: "Write", hooks: [{ type: "command", command: "crasp check --hook-input Write" }] },
              { matcher: "Bash", hooks: [{ type: "command", command: "/old/pnpm/crasp check --hook-input Bash" }] },
              { matcher: "Write", hooks: [{ type: "command", command: "eslint --fix" }] },
            ],
            PostToolUse: [
              { matcher: "Read", hooks: [{ type: "command", command: "crasp check --hook-input Read --post" }] },
            ],
          },
        })
      );
      runSetup(ctx);
      const settings = JSON.parse(
        await readFile(path.join(claudeDir, "settings.json"), "utf8")
      ) as { hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> } };
      const commands = settings.hooks.PreToolUse.flatMap((h) => h.hooks.map((x) => x.command));
      expect(commands).toContain("eslint --fix");
      expect(commands.filter((c) => c.includes("--hook-input Write") && c.includes("crasp"))).toHaveLength(1);
      expect(commands.some((c) => c === "crasp check --hook-input Write")).toBe(false);
      expect(commands.some((c) => c.startsWith("/old/pnpm/"))).toBe(false);
    } finally { await cleanup(ctx); }
  });

  it("removes a stale duplicate even when the canonical hook is already present", async () => {
    const ctx = await makeCtx();
    try {
      runSetup(ctx); // writes all canonical hooks
      const settingsPath = path.join(ctx.project, ".claude", "settings.json");
      const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
        hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> };
      };
      settings.hooks.PreToolUse.push({
        matcher: "Write",
        hooks: [{ type: "command", command: "crasp check --hook-input Write" }],
      });
      await writeFile(settingsPath, JSON.stringify(settings));
      runSetup(ctx);
      const after = JSON.parse(await readFile(settingsPath, "utf8")) as {
        hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
      };
      const writeCommands = after.hooks.PreToolUse
        .filter((h) => h.matcher === "Write")
        .flatMap((h) => h.hooks.map((x) => x.command))
        .filter((c) => c.includes("crasp"));
      expect(writeCommands).toHaveLength(1);
      expect(writeCommands[0]).toBe(expectedCommand(ctx.bundle, "check --hook-input Write"));
    } finally { await cleanup(ctx); }
  });

  it("normalizes a mixed entry per command — foreign survives, stale crasp dropped", async () => {
    const ctx = await makeCtx();
    try {
      const claudeDir = path.join(ctx.project, ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(
        path.join(claudeDir, "settings.json"),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: "Write",
                hooks: [
                  { type: "command", command: "eslint --fix" },
                  { type: "command", command: "crasp check --hook-input Write" },
                ],
              },
            ],
          },
        })
      );
      runSetup(ctx);
      const settings = JSON.parse(
        await readFile(path.join(claudeDir, "settings.json"), "utf8")
      ) as { hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> } };
      const commands = settings.hooks.PreToolUse.flatMap((h) => h.hooks.map((x) => x.command));
      expect(commands).toContain("eslint --fix");
      expect(commands.some((c) => c === "crasp check --hook-input Write")).toBe(false);
      expect(
        commands.filter((c) => c === expectedCommand(ctx.bundle, "check --hook-input Write"))
      ).toHaveLength(1);
    } finally { await cleanup(ctx); }
  });

  it("dedupes a canonical+stale hand-merged into one entry — canonical kept once", async () => {
    const ctx = await makeCtx();
    try {
      const claudeDir = path.join(ctx.project, ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(
        path.join(claudeDir, "settings.json"),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: "Write",
                hooks: [
                  { type: "command", command: expectedCommand(ctx.bundle, "check --hook-input Write") },
                  { type: "command", command: "crasp check --hook-input Write" },
                ],
              },
            ],
          },
        })
      );
      runSetup(ctx);
      const settings = JSON.parse(
        await readFile(path.join(claudeDir, "settings.json"), "utf8")
      ) as { hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> } };
      const writeCommands = settings.hooks.PreToolUse
        .filter((h) => h.matcher === "Write")
        .flatMap((h) => h.hooks.map((x) => x.command))
        .filter((c) => c.includes("crasp"));
      expect(writeCommands).toHaveLength(1);
      expect(writeCommands[0]).toBe(expectedCommand(ctx.bundle, "check --hook-input Write"));
      expect(writeCommands.some((c) => c === "crasp check --hook-input Write")).toBe(false);
    } finally { await cleanup(ctx); }
  });

  it("leaves an array-shaped .mcp.json untouched and warns", async () => {
    const ctx = await makeCtx();
    try {
      const planted = JSON.stringify({ mcpServers: [] });
      await writeFile(path.join(ctx.project, ".mcp.json"), planted);
      const result = runSetup(ctx);
      expect(await readFile(path.join(ctx.project, ".mcp.json"), "utf8")).toBe(planted);
      expect(result.stdout + result.stderr).toContain("unexpected shape");
    } finally { await cleanup(ctx); }
  });

  it("leaves a non-array PreToolUse untouched, skips wiring, and fails verification", async () => {
    const ctx = await makeCtx();
    try {
      const claudeDir = path.join(ctx.project, ".claude");
      await mkdir(claudeDir, { recursive: true });
      const planted = JSON.stringify({ hooks: { PreToolUse: {} } });
      await writeFile(path.join(claudeDir, "settings.json"), planted);
      const result = runSetup(ctx);
      expect(await readFile(path.join(claudeDir, "settings.json"), "utf8")).toBe(planted);
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain("protection verified");
    } finally { await cleanup(ctx); }
  });

  it("never clobbers a malformed settings.json or .mcp.json", async () => {
    const ctx = await makeCtx();
    try {
      const claudeDir = path.join(ctx.project, ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(path.join(claudeDir, "settings.json"), "{ not json !");
      await writeFile(path.join(ctx.project, ".mcp.json"), "also { not json");
      const result = runSetup(ctx);
      expect(await readFile(path.join(claudeDir, "settings.json"), "utf8")).toBe("{ not json !");
      expect(await readFile(path.join(ctx.project, ".mcp.json"), "utf8")).toBe("also { not json");
      expect(result.stdout + result.stderr).toContain("not valid JSON");
    } finally { await cleanup(ctx); }
  });

  it("rewrites a stale .mcp.json crasp entry but preserves other servers", async () => {
    const ctx = await makeCtx();
    try {
      await writeFile(
        path.join(ctx.project, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            crasp: { type: "stdio", command: "crasp", args: ["mcp"] },
            other: { type: "stdio", command: "other-server", args: [] },
          },
        })
      );
      runSetup(ctx);
      const mcp = JSON.parse(await readFile(path.join(ctx.project, ".mcp.json"), "utf8")) as {
        mcpServers: Record<string, { command: string; args?: string[] }>;
      };
      expect(mcp.mcpServers.crasp.command).toBe(process.execPath);
      expect(mcp.mcpServers.other.command).toBe("other-server");
    } finally { await cleanup(ctx); }
  });
});

describe("setup self-verification", () => {
  it("reports both verification stages on success", async () => {
    const ctx = await makeCtx();
    try {
      const result = runSetup(ctx);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Verified: installed bundle blocks a test secret");
      expect(result.stdout).toContain("Verified: the exact hook command written to .claude/settings.json works");
      expect(result.stdout).toContain("Restart any open Claude Code session");
    } finally { await cleanup(ctx); }
  });

  it("auto-repairs a corrupt pre-existing bundle and still succeeds", async () => {
    const ctx = await makeCtx();
    try {
      // Corrupt "newer" bundle: answers --version 99.0.0 (so install keeps it)
      // but crashes on check. Stage 1 must detect this, force-recopy the real
      // bundle, and proceed.
      await mkdir(path.dirname(ctx.bundle), { recursive: true });
      await writeFile(
        ctx.bundle,
        'if (process.argv.includes("--version")) { console.log("99.0.0"); process.exit(0); }\n' +
        "process.exit(7);\n"
      );
      const result = runSetup(ctx);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("repaired");
      const v = spawnSync(process.execPath, [ctx.bundle, "--version"], { encoding: "utf8" });
      expect(v.stdout.trim()).toBe(CLI_VERSION);
    } finally { await cleanup(ctx); }
  });

  it("exits 1 without wiring anything when the bundle cannot be made to work", async () => {
    const ctx = await makeCtx();
    try {
      // Make ~/.crasp/bin/crasp.js an unwritable DIRECTORY: install and
      // force-repair both fail, so stage 1 cannot ever pass.
      await mkdir(path.join(ctx.bundle, "block"), { recursive: true });
      const result = runSetup(ctx);
      expect(result.status).toBe(1);
      await expect(
        access(path.join(ctx.project, ".claude", "settings.json"))
      ).rejects.toThrow();
      expect(result.stdout + result.stderr).toMatch(/Could not install|verification failed/);
    } finally { await cleanup(ctx); }
  });

  it("verifies successfully when a foreign Write hook precedes the crasp hook", async () => {
    const ctx = await makeCtx();
    try {
      const claudeDir = path.join(ctx.project, ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(
        path.join(claudeDir, "settings.json"),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              { matcher: "Write", hooks: [{ type: "command", command: "prettier --write" }] },
            ],
          },
        })
      );
      const result = runSetup(ctx);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("protection verified");
      const settings = JSON.parse(
        await readFile(path.join(claudeDir, "settings.json"), "utf8")
      ) as { hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> } };
      const commands = settings.hooks.PreToolUse.flatMap((h) => h.hooks.map((x) => x.command));
      expect(commands).toContain("prettier --write");
    } finally { await cleanup(ctx); }
  });

  it("fails wiring verification (no banner, no exit-0) when settings.json is malformed so wiring is skipped", async () => {
    const ctx = await makeCtx();
    try {
      const claudeDir = path.join(ctx.project, ".claude");
      await mkdir(claudeDir, { recursive: true });
      const malformed = "{ not json !";
      await writeFile(path.join(claudeDir, "settings.json"), malformed);
      const result = runSetup(ctx);
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain("protection verified");
      expect(await readFile(path.join(claudeDir, "settings.json"), "utf8")).toBe(malformed);
    } finally { await cleanup(ctx); }
  });
});

describe("setup git pre-commit hook", () => {
  it("skips when the project has no .git directory", async () => {
    const ctx = await makeCtx();
    try {
      const result = runSetup(ctx);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("No git repository");
      await expect(access(path.join(ctx.project, ".git"))).rejects.toThrow();
    } finally { await cleanup(ctx); }
  });

  it("writes absolute node+bundle paths with fallback lookup and skip message", async () => {
    const ctx = await makeCtx();
    try {
      await mkdir(path.join(ctx.project, ".git"), { recursive: true });
      runSetup(ctx);
      const hook = await readFile(
        path.join(ctx.project, ".git", "hooks", "pre-commit"), "utf8"
      );
      expect(hook.split("\n")[1]).toBe("# managed-by: crasp");
      expect(hook).toContain(`CRASP_NODE='${process.execPath}'`);
      expect(hook).toContain(`CRASP_BIN='${ctx.bundle}'`);
      expect(hook).toContain('command -v node');
      expect(hook).toContain('exec "$CRASP_NODE" "$CRASP_BIN" check --staged');
      expect(hook).toContain("re-run: npx @crasp/cli setup");
    } finally { await cleanup(ctx); }
  });

  it("upgrades an old managed hook but never touches a foreign one", async () => {
    const ctx = await makeCtx();
    try {
      const hooksDir = path.join(ctx.project, ".git", "hooks");
      await mkdir(hooksDir, { recursive: true });
      await writeFile(
        path.join(hooksDir, "pre-commit"),
        "#!/usr/bin/env sh\n# managed-by: crasp\n\nexec crasp check --staged\n"
      );
      runSetup(ctx);
      const managed = await readFile(path.join(hooksDir, "pre-commit"), "utf8");
      expect(managed).toContain('"$CRASP_NODE" "$CRASP_BIN"');

      await writeFile(path.join(hooksDir, "pre-commit"), "#!/bin/sh\nmy-own-hook\n");
      runSetup(ctx);
      const foreign = await readFile(path.join(hooksDir, "pre-commit"), "utf8");
      expect(foreign).toContain("my-own-hook");
    } finally { await cleanup(ctx); }
  });
});
