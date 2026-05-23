import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CraspConfig } from "../../types/index.js";

export const DEFAULT_CONFIG: CraspConfig = {
  version: "1",
  policyPath: "crasp.policy.yml",
  hooksEnabled: false,
  hookPath: ".git/hooks/pre-commit",
  builtinPolicies: ["crasp-builtin-security"],
  createdAt: "1970-01-01T00:00:00.000Z"
};

export async function loadConfig(
  dir = process.cwd()
): Promise<CraspConfig | undefined> {
  try {
    const raw = await readFile(configPath(dir), "utf8");
    return JSON.parse(raw) as CraspConfig;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function writeConfig(
  config: CraspConfig,
  dir = process.cwd()
): Promise<string> {
  const targetPath = configPath(dir);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`);

  return targetPath;
}

function configPath(dir: string): string {
  return path.join(dir, ".crasp", "config.json");
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
