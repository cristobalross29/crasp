import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  loadConfig,
  writeConfig
} from "../../src/core/config/index.js";

describe("config", () => {
  it("returns undefined when no config exists", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-config-"));

    await expect(loadConfig(tempDir)).resolves.toBeUndefined();
  });

  it("writes and loads .agentfence/config.json", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-config-"));
    const config = {
      ...DEFAULT_CONFIG,
      hooksEnabled: true,
      createdAt: "2026-05-22T00:00:00.000Z"
    };

    const configPath = await writeConfig(config, tempDir);
    const loaded = await loadConfig(tempDir);

    expect(configPath).toBe(path.join(tempDir, ".agentfence", "config.json"));
    expect(loaded).toEqual(config);
  });
});
