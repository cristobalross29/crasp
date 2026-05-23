import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/core/config/index.js";
import { setupCommand } from "../../src/cli/commands/setup.js";
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
});
