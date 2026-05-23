import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/core/config/index.js";
import { setupCommand, ensureClaudeMdSection } from "../../src/cli/commands/setup.js";
import { getHookStatus } from "../../src/cli/commands/hook.js";

const originalCwd = process.cwd();

describe("setupCommand", () => {
  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
  });

  it("creates config and ensures .agentfence/ is ignored", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-setup-"));

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(tempDir);

    await setupCommand();

    const config = await loadConfig(tempDir);
    const gitignore = await readFile(path.join(tempDir, ".gitignore"), "utf8");
    const hookStatus = await getHookStatus(tempDir);

    expect(config?.builtinPolicies).toContain("agentfence-builtin-security");
    expect(config?.hooksEnabled).toBe(true);
    expect(gitignore).toContain(".agentfence/");
    expect(hookStatus.healthy).toBe(true);
  });

  it("writes agentfence MCP entry to .mcp.json", async () => {
    const freshRoot = await mkdtemp(
      path.join(os.tmpdir(), "af-setup-mcp-test-")
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);

    try {
      await setupCommand();
      const raw = await readFile(path.join(freshRoot, ".mcp.json"), "utf8");
      const mcpConfig = JSON.parse(raw) as {
        mcpServers: Record<string, unknown>;
      };
      const entry = mcpConfig.mcpServers["agentfence"] as Record<
        string,
        unknown
      >;
      expect(entry).toBeDefined();
      expect(entry["type"]).toBe("stdio");
      expect(typeof entry["command"]).toBe("string");
      expect((entry["command"] as string).length).toBeGreaterThan(0);
      expect(entry["args"]).toEqual(["mcp"]);
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });

  it("writes a PreToolUse Write hook to .claude/settings.json", async () => {
    const freshRoot = await mkdtemp(path.join(os.tmpdir(), "af-hook-test-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);
    try {
      await setupCommand();
      const raw = await readFile(
        path.join(freshRoot, ".claude", "settings.json"),
        "utf8"
      );
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const hooks = settings.hooks as Record<string, unknown>;
      expect(hooks).toBeDefined();
      const preToolUse = hooks.PreToolUse as Array<Record<string, unknown>>;
      expect(Array.isArray(preToolUse)).toBe(true);
      const writeHook = preToolUse.find((h) => h.matcher === "Write");
      expect(writeHook).toBeDefined();
      const hookDef = (writeHook!.hooks as Array<Record<string, unknown>>)[0];
      expect(hookDef.type).toBe("command");
      expect(hookDef.command as string).toContain("agentfence");
      expect(hookDef.command as string).toContain("--stdin");
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });

  it("writes CLAUDE.md documentation block", async () => {
    const freshRoot = await mkdtemp(path.join(os.tmpdir(), "af-claude-md-int-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);
    try {
      await setupCommand();
      const content = await readFile(path.join(freshRoot, "CLAUDE.md"), "utf8");
      expect(content).toContain("<!-- agentfence:start -->");
      expect(content).toContain("<!-- agentfence:end -->");
      expect(content).toContain("agentfence.policy.yml");
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });

  it("does not duplicate hook or CLAUDE.md section on second run", async () => {
    const freshRoot = await mkdtemp(path.join(os.tmpdir(), "af-idempotent-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);
    try {
      await setupCommand();
      await setupCommand();
      const claudeMd = await readFile(path.join(freshRoot, "CLAUDE.md"), "utf8");
      const sentinelCount = (claudeMd.match(/<!-- agentfence:start -->/g) ?? []).length;
      expect(sentinelCount).toBe(1);

      const raw = await readFile(
        path.join(freshRoot, ".claude", "settings.json"),
        "utf8"
      );
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const preToolUse = (settings.hooks as Record<string, unknown>).PreToolUse as unknown[];
      const writeHooks = preToolUse.filter(
        (h) => typeof h === "object" && h !== null && (h as Record<string, unknown>).matcher === "Write"
      );
      expect(writeHooks).toHaveLength(1);
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });
});

describe("ensureClaudeMdSection", () => {
  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
  });

  it("creates CLAUDE.md when it does not exist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "af-claude-md-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);
    try {
      await ensureClaudeMdSection(dir);
      const content = await readFile(path.join(dir, "CLAUDE.md"), "utf8");
      expect(content).toContain("<!-- agentfence:start -->");
      expect(content).toContain("<!-- agentfence:end -->");
      expect(content).toContain("agentfence.policy.yml");
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("appends to existing CLAUDE.md without clobbering it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "af-claude-md-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);
    try {
      await writeFile(path.join(dir, "CLAUDE.md"), "# My Project\n\nExisting content.\n");
      await ensureClaudeMdSection(dir);
      const content = await readFile(path.join(dir, "CLAUDE.md"), "utf8");
      expect(content).toContain("# My Project");
      expect(content).toContain("Existing content.");
      expect(content).toContain("<!-- agentfence:start -->");
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips when section already present (no force)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "af-claude-md-"));
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);
    try {
      await ensureClaudeMdSection(dir);
      const before = await readFile(path.join(dir, "CLAUDE.md"), "utf8");
      await ensureClaudeMdSection(dir, false);
      const after = await readFile(path.join(dir, "CLAUDE.md"), "utf8");
      expect(after).toBe(before);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("Skipped"));
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("replaces block with force without losing surrounding content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "af-claude-md-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);
    try {
      const stale =
        "# Project\n\n<!-- agentfence:start -->\nOLD CONTENT\n<!-- agentfence:end -->\n\n## More\n";
      await writeFile(path.join(dir, "CLAUDE.md"), stale);
      await ensureClaudeMdSection(dir, true);
      const content = await readFile(path.join(dir, "CLAUDE.md"), "utf8");
      expect(content).not.toContain("OLD CONTENT");
      expect(content).toContain("agentfence.policy.yml");
      expect(content).toContain("# Project");
      expect(content).toContain("## More");
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
