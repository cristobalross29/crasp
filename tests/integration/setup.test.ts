import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("creates config and ensures .crasp/ is ignored", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "crasp-setup-"));

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(tempDir);

    await setupCommand();

    const config = await loadConfig(tempDir);
    const gitignore = await readFile(path.join(tempDir, ".gitignore"), "utf8");
    const hookStatus = await getHookStatus(tempDir);

    expect(config?.builtinPolicies).toContain("crasp-builtin-security");
    expect(config?.hooksEnabled).toBe(true);
    expect(gitignore).toContain(".crasp/");
    expect(gitignore).toContain(".claude/settings.json");
    expect(hookStatus.healthy).toBe(true);
  });

  it("writes crasp MCP entry to .mcp.json", async () => {
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
      const entry = mcpConfig.mcpServers["crasp"] as Record<
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

  it("writes PreToolUse hooks for Write, Edit, Read, and Bash to .claude/settings.json", async () => {
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
      expect(preToolUse).toHaveLength(4);

      const matchers = preToolUse.map((h: Record<string, unknown>) => h.matcher);
      expect(matchers).toEqual(expect.arrayContaining(["Write", "Edit", "Read", "Bash"]));

      const bashHook = preToolUse.find((h: Record<string, unknown>) => h.matcher === "Bash");
      expect(JSON.stringify(bashHook)).toContain("check --hook-input Bash");

      for (const tool of ["Write", "Edit", "Read", "Bash"] as const) {
        const hook = preToolUse.find((h) => h.matcher === tool);
        expect(hook, `${tool} hook should be installed`).toBeDefined();
        const hookDef = (hook!.hooks as Array<Record<string, unknown>>)[0];
        expect(hookDef.type).toBe("command");
        expect(hookDef.command as string).toContain("crasp");
        expect(hookDef.command as string).toContain("--hook-input");
        expect(hookDef.command as string).toContain(tool);
      }
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });

  it("writes PostToolUse hooks for Read, Bash, WebFetch, and WebSearch", async () => {
    const freshRoot = await mkdtemp(path.join(os.tmpdir(), "af-post-hook-test-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);
    try {
      await setupCommand();
      const raw = await readFile(path.join(freshRoot, ".claude", "settings.json"), "utf8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const hooks = settings.hooks as Record<string, unknown>;
      const postToolUse = hooks.PostToolUse as Array<Record<string, unknown>>;
      expect(Array.isArray(postToolUse)).toBe(true);
      expect(postToolUse).toHaveLength(4);

      const matchers = postToolUse.map((h) => h.matcher);
      expect(matchers).toEqual(expect.arrayContaining(["Read", "Bash", "WebFetch", "WebSearch"]));

      for (const tool of ["Read", "Bash", "WebFetch", "WebSearch"] as const) {
        const hook = postToolUse.find((h) => h.matcher === tool);
        expect(hook, `${tool} post hook`).toBeDefined();
        const hookDef = (hook!.hooks as Array<Record<string, unknown>>)[0];
        expect(hookDef.command as string).toContain("--hook-input");
        expect(hookDef.command as string).toContain(tool);
        expect(hookDef.command as string).toContain("--post");
      }
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });

  // D10 regression: an EXISTING user whose settings.json already has all PreToolUse
  // hooks must still get PostToolUse hooks installed. The old `if (allInstalled)
  // return` skipped them. Simulate by running setup twice (first run installs Pre;
  // the combined guard must not short-circuit before Post is present).
  it("installs PostToolUse hooks even when PreToolUse hooks already exist (run twice)", async () => {
    const freshRoot = await mkdtemp(path.join(os.tmpdir(), "af-post-idempotent-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);
    try {
      await setupCommand();
      await setupCommand(); // second run must be a no-op that still leaves Post hooks present
      const raw = await readFile(path.join(freshRoot, ".claude", "settings.json"), "utf8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const hooks = settings.hooks as Record<string, unknown>;
      const postToolUse = hooks.PostToolUse as Array<Record<string, unknown>>;
      expect(Array.isArray(postToolUse)).toBe(true);
      // Exactly four — no duplication on the second run.
      expect(postToolUse).toHaveLength(4);
      const matchers = postToolUse.map((h) => h.matcher);
      expect(matchers).toEqual(expect.arrayContaining(["Read", "Bash", "WebFetch", "WebSearch"]));
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });

  // D10 regression: seed a settings.json with ONLY PreToolUse crasp hooks (the
  // shape an existing F1 user has), then run setup — Post hooks must appear.
  it("adds PostToolUse hooks to a settings.json that has only PreToolUse hooks", async () => {
    const freshRoot = await mkdtemp(path.join(os.tmpdir(), "af-post-seed-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);
    try {
      await mkdir(path.join(freshRoot, ".claude"), { recursive: true });
      const seeded = {
        hooks: {
          PreToolUse: ["Write", "Edit", "Read", "Bash"].map((tool) => ({
            matcher: tool,
            hooks: [{ type: "command", command: `crasp check --hook-input ${tool}` }],
          })),
        },
      };
      await writeFile(path.join(freshRoot, ".claude", "settings.json"), JSON.stringify(seeded, null, 2));
      await setupCommand();
      const raw = await readFile(path.join(freshRoot, ".claude", "settings.json"), "utf8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const hooks = settings.hooks as Record<string, unknown>;
      const postToolUse = (hooks.PostToolUse as Array<Record<string, unknown>>) ?? [];
      expect(postToolUse).toHaveLength(4);
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });

  it("starter policy includes commented exceptions block", async () => {
    const freshRoot = await mkdtemp(path.join(os.tmpdir(), "af-policy-exceptions-"));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);
    try {
      await setupCommand();
      const policy = await readFile(path.join(freshRoot, "crasp.policy.yml"), "utf8");
      expect(policy).toContain("# exceptions:");
      expect(policy).toContain("# Exceptions:");
      expect(policy).toContain("ops: [read]");
      expect(policy).toContain("ops: [write, edit]");
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
      expect(content).toContain("<!-- crasp:start -->");
      expect(content).toContain("<!-- crasp:end -->");
      expect(content).toContain("crasp.policy.yml");
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
      const sentinelCount = (claudeMd.match(/<!-- crasp:start -->/g) ?? []).length;
      expect(sentinelCount).toBe(1);

      const raw = await readFile(
        path.join(freshRoot, ".claude", "settings.json"),
        "utf8"
      );
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const preToolUse = (settings.hooks as Record<string, unknown>).PreToolUse as unknown[];
      expect(preToolUse).toHaveLength(4);
      for (const tool of ["Write", "Edit", "Read", "Bash"] as const) {
        const toolHooks = preToolUse.filter(
          (h) => typeof h === "object" && h !== null && (h as Record<string, unknown>).matcher === tool
        );
        expect(toolHooks, `${tool} hook should appear exactly once`).toHaveLength(1);
      }
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
      expect(content).toContain("<!-- crasp:start -->");
      expect(content).toContain("<!-- crasp:end -->");
      expect(content).toContain("crasp.policy.yml");
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
      expect(content).toContain("<!-- crasp:start -->");
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
        "# Project\n\n<!-- crasp:start -->\nOLD CONTENT\n<!-- crasp:end -->\n\n## More\n";
      await writeFile(path.join(dir, "CLAUDE.md"), stale);
      await ensureClaudeMdSection(dir, true);
      const content = await readFile(path.join(dir, "CLAUDE.md"), "utf8");
      expect(content).not.toContain("OLD CONTENT");
      expect(content).toContain("crasp.policy.yml");
      expect(content).toContain("# Project");
      expect(content).toContain("## More");
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
