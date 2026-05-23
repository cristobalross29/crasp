import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import type { HookStatus } from "../../types/index.js";

const sentinel = "# managed-by: agentfence";

export async function hookCommand(action: string): Promise<void> {
  if (action === "install") {
    await installHook();
    return;
  }

  if (action === "uninstall") {
    await uninstallHook();
    return;
  }

  if (action === "status") {
    console.log(JSON.stringify(await getHookStatus(), null, 2));
    return;
  }

  throw new Error(`Unsupported hook action: ${action}`);
}

export async function getHookStatus(dir = process.cwd()): Promise<HookStatus> {
  const hookPath = path.join(dir, ".git", "hooks", "pre-commit");

  if (!(await exists(hookPath))) {
    return {
      installed: false,
      managed: false,
      path: hookPath,
      healthy: false
    };
  }

  const raw = await readFile(hookPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const managed = lines[1] === sentinel;
  const healthy = managed && lines[0] === "#!/usr/bin/env sh";

  return {
    installed: true,
    managed,
    path: hookPath,
    healthy
  };
}

export async function installHook(dir = process.cwd()): Promise<void> {
  const hookPath = path.join(dir, ".git", "hooks", "pre-commit");

  if (await exists(hookPath)) {
    const raw = await readFile(hookPath, "utf8");
    const lines = raw.split(/\r?\n/);
    if (lines[1] !== sentinel) {
      console.log(chalk.yellow("Pre-commit hook already exists and is not managed by AgentFence. Run `agentfence hook install` to overwrite it manually."));
      return;
    }
  }

  const content = [
    "#!/usr/bin/env sh",
    sentinel,
    "",
    "if ! command -v agentfence >/dev/null 2>&1; then",
    '  echo "[agentfence] not found on PATH — skipping pre-commit check"',
    "  exit 0",
    "fi",
    "",
    "exec agentfence check --staged",
  ].join("\n");

  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, `${content}\n`);
  await chmod(hookPath, 0o755);

  console.log(chalk.green("Installed AgentFence pre-commit hook."));
}

async function uninstallHook(): Promise<void> {
  const status = await getHookStatus();

  if (!status.installed || !status.path) {
    console.log("No pre-commit hook installed.");
    return;
  }

  if (!status.managed) {
    console.log(chalk.yellow("Pre-commit hook is not managed by AgentFence; leaving it in place."));
    return;
  }

  await rm(status.path);
  console.log(chalk.green("Removed AgentFence pre-commit hook."));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
