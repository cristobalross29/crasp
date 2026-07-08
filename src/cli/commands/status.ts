import { access, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../core/config/index.js";
import { craspBundlePath } from "../../core/install/index.js";
import { getHookStatus } from "./hook.js";
import { readInstalledVersion } from "./setup.js";
import type { InstallHealth, ProjectStatus } from "../../types/index.js";

const REMEDIATION = "re-run: npx crasp setup";

function extractAbsolutePaths(command: string): string[] {
  const quoted = [
    ...command.matchAll(/'([^']+)'/g),
    ...command.matchAll(/"([^"]+)"/g),
  ].map((m) => m[1]);
  return quoted.filter((p) => path.isAbsolute(p));
}

export async function getInstallHealth(dir = process.cwd()): Promise<InstallHealth> {
  const problems: string[] = [];

  const bundle = craspBundlePath(os.homedir());
  const bundleVersion = (await exists(bundle)) ? await readInstalledVersion(bundle) : null;
  if (bundleVersion === null) {
    problems.push(`installed bundle missing or unreadable at ${bundle} — ${REMEDIATION}`);
  }

  const settingsPath = path.join(dir, ".claude", "settings.json");
  if (await exists(settingsPath)) {
    try {
      const raw = JSON.parse(await readFile(settingsPath, "utf8")) as {
        hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
      };
      const commands = Object.values(raw.hooks ?? {})
        .flat()
        .flatMap((entry) => entry.hooks ?? [])
        .map((h) => h.command)
        .filter((c): c is string => typeof c === "string" && c.includes("crasp"));
      for (const command of commands) {
        const paths = extractAbsolutePaths(command);
        if (paths.length === 0) {
          problems.push(`legacy crasp hook without absolute paths ("${command.slice(0, 60)}") — ${REMEDIATION}`);
          continue;
        }
        for (const p of paths) {
          if (!(await exists(p))) {
            problems.push(`hook references missing path ${p} — ${REMEDIATION}`);
          }
        }
      }
    } catch {
      problems.push(`.claude/settings.json is unreadable — ${REMEDIATION}`);
    }
  }

  const mcpPath = path.join(dir, ".mcp.json");
  if (await exists(mcpPath)) {
    try {
      const raw = JSON.parse(await readFile(mcpPath, "utf8")) as {
        mcpServers?: { crasp?: { command?: string; args?: string[] } };
      };
      const crasp = raw.mcpServers?.crasp;
      if (crasp) {
        const candidates = [crasp.command, crasp.args?.[0]].filter(
          (x): x is string => typeof x === "string"
        );
        if (!candidates.some((p) => path.isAbsolute(p))) {
          problems.push(`legacy .mcp.json crasp entry ("${crasp.command ?? ""}") — ${REMEDIATION}`);
        }
        for (const p of candidates.filter((x) => path.isAbsolute(x))) {
          if (!(await exists(p))) {
            problems.push(`.mcp.json references missing path ${p} — ${REMEDIATION}`);
          }
        }
      }
    } catch {
      problems.push(`.mcp.json is unreadable — ${REMEDIATION}`);
    }
  }

  const preCommitPath = path.join(dir, ".git", "hooks", "pre-commit");
  if (await exists(preCommitPath)) {
    try {
      const raw = await readFile(preCommitPath, "utf8");
      const lines = raw.split(/\r?\n/);
      if (lines[1] === "# managed-by: crasp") {
        let hasVar = false;
        for (const varName of ["CRASP_NODE", "CRASP_BIN"]) {
          const match = raw.match(new RegExp(`${varName}='([^']+)'`));
          if (match) {
            hasVar = true;
            if (!(await exists(match[1]))) {
              problems.push(`git pre-commit hook references missing path ${match[1]} — ${REMEDIATION}`);
            }
          }
        }
        if (!hasVar) {
          problems.push(`git pre-commit hook uses a legacy format — ${REMEDIATION}`);
        }
      }
    } catch {
      problems.push(`git pre-commit hook is unreadable — ${REMEDIATION}`);
    }
  }

  const deduped = [...new Set(problems)];
  return { ok: deduped.length === 0, bundleVersion, problems: deduped };
}

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
    runCount: await countRunDirs(path.join(dir, ".crasp", "runs")),
    installHealth: await getInstallHealth(dir)
  };
}

async function resolvePolicyPath(
  dir: string,
  configuredPolicyPath?: string
): Promise<string | undefined> {
  const candidates = [
    configuredPolicyPath ? path.resolve(dir, configuredPolicyPath) : undefined,
    path.join(dir, "crasp.policy.yml")
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
