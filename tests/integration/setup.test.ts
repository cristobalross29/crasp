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

  it("writes agentfence MCP entry to .claude/settings.json", async () => {
    const freshRoot = await mkdtemp(
      path.join(os.tmpdir(), "af-setup-mcp-test-")
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(freshRoot);

    try {
      await setupCommand();
      const raw = await readFile(
        path.join(freshRoot, ".claude", "settings.json"),
        "utf8"
      );
      const settings = JSON.parse(raw) as Record<string, unknown>;
      const mcpServers = settings.mcpServers as Record<string, unknown>;
      expect(mcpServers).toBeDefined();
      expect(mcpServers["agentfence"]).toEqual({
        command: "agentfence",
        args: ["mcp"],
      });
    } finally {
      process.chdir(originalCwd);
      await rm(freshRoot, { recursive: true, force: true });
    }
  });
});
