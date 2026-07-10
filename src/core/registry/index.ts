import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RegistryEntry } from "../../types/index.js";

const REGISTRY_FILE = "projects.json";

export function defaultCraspDir(): string {
  return path.join(os.homedir(), ".crasp");
}

export function registryPath(craspDir = defaultCraspDir()): string {
  return path.join(craspDir, REGISTRY_FILE);
}

export async function readRegistry(craspDir = defaultCraspDir()): Promise<RegistryEntry[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(registryPath(craspDir), "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (e): e is RegistryEntry =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as RegistryEntry).path === "string" &&
      typeof (e as RegistryEntry).registeredAt === "string"
  );
}

export async function registerProject(
  projectPath: string,
  craspDir = defaultCraspDir()
): Promise<void> {
  // Best-effort like appendHookLogEntry — the registry must never break
  // setup or status.
  try {
    const abs = path.resolve(projectPath);
    const entries = await readRegistry(craspDir);
    if (entries.some((e) => e.path === abs)) return;
    entries.push({ path: abs, registeredAt: new Date().toISOString() });
    await mkdir(craspDir, { recursive: true });
    await writeFile(registryPath(craspDir), `${JSON.stringify(entries, null, 2)}\n`);
  } catch {
    // Swallow all errors
  }
}
