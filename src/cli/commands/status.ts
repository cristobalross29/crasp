import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../../core/config/index.js";
import { getHookStatus } from "./hook.js";
import type { ProjectStatus } from "../../types/index.js";

export async function statusCommand(): Promise<void> {
  const status = await getProjectStatus();

  console.log(JSON.stringify(status, null, 2));
}

export async function getProjectStatus(
  dir = process.cwd()
): Promise<ProjectStatus> {
  const config = await loadConfig(dir);
  const policyPath = await resolvePolicyPath(dir, config?.policyPath);

  return {
    initialized: Boolean(config),
    config,
    hookStatus: await getHookStatus(dir),
    policyPath,
    scenarioCount: await countScenarioFiles(path.join(dir, "scenarios")),
    runCount: await countRunDirs(path.join(dir, ".agentfence", "runs"))
  };
}

async function resolvePolicyPath(
  dir: string,
  configuredPolicyPath?: string
): Promise<string | undefined> {
  const candidates = [
    configuredPolicyPath ? path.resolve(dir, configuredPolicyPath) : undefined,
    path.join(dir, "agentfence.policy.yml")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function countScenarioFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        count += await countScenarioFiles(entryPath);
        continue;
      }

      if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
        count += 1;
      }
    }

    return count;
  } catch (error) {
    if (isNotFoundError(error)) {
      return 0;
    }

    throw error;
  }
}

async function countRunDirs(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch (error) {
    if (isNotFoundError(error)) {
      return 0;
    }

    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
