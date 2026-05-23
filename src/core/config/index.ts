import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentFenceConfig } from "../../types/index.js";

export const DEFAULT_CONFIG: AgentFenceConfig = {
  version: "1",
  policyPath: "agentfence.policy.yml",
  hooksEnabled: false,
  hookPath: ".git/hooks/pre-commit",
  builtinPolicies: ["agentfence-builtin-security"],
  createdAt: "1970-01-01T00:00:00.000Z"
};

export async function loadConfig(
  dir = process.cwd()
): Promise<AgentFenceConfig | undefined> {
  try {
    const raw = await readFile(configPath(dir), "utf8");
    return JSON.parse(raw) as AgentFenceConfig;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function writeConfig(
  config: AgentFenceConfig,
  dir = process.cwd()
): Promise<string> {
  const targetPath = configPath(dir);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`);

  return targetPath;
}

function configPath(dir: string): string {
  return path.join(dir, ".agentfence", "config.json");
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
