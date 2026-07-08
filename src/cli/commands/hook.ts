import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import { craspBundlePath, shq } from "../../core/install/index.js";
import type { HookStatus } from "../../types/index.js";

const sentinel = "# managed-by: crasp";

export async function hookCommand(action: string): Promise<void> {
  if (action === "install") {
    const { resolveInstalledBundle } = await import("./setup.js");
    const { bundlePath } = await resolveInstalledBundle();
    await installHook(process.cwd(), bundlePath);
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

  try {
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
  } catch {
    return {
      installed: true,
      managed: false,
      path: hookPath,
      healthy: false
    };
  }
}

export async function installHook(
  dir = process.cwd(),
  bundlePath = craspBundlePath(os.homedir())
): Promise<void> {
  if (!(await exists(path.join(dir, ".git")))) {
    console.log(chalk.yellow("No git repository — skipped pre-commit hook (re-run setup after git init)"));
    return;
  }

  const hookPath = path.join(dir, ".git", "hooks", "pre-commit");

  if (await exists(hookPath)) {
    try {
      const raw = await readFile(hookPath, "utf8");
      const lines = raw.split(/\r?\n/);
      if (lines[1] !== sentinel) {
        console.log(chalk.yellow("Pre-commit hook already exists and is not managed by Crasp. Run `crasp hook install` to overwrite it manually."));
        return;
      }
    } catch {
      console.log(chalk.yellow("Pre-commit hook exists but is unreadable. Run `crasp hook install` to overwrite it manually."));
      return;
    }
  }

  const content = [
    "#!/usr/bin/env sh",
    sentinel,
    "",
    `CRASP_NODE=${shq(process.execPath)}`,
    `CRASP_BIN=${shq(bundlePath)}`,
    "",
    '[ -x "$CRASP_NODE" ] || CRASP_NODE="$(command -v node || true)"',
    "",
    'if [ ! -x "$CRASP_NODE" ] || [ ! -f "$CRASP_BIN" ]; then',
    '  echo "[crasp] installed binary missing — skipping pre-commit check (re-run: npx @cristobalross29/crasp setup)"',
    "  exit 0",
    "fi",
    "",
    'exec "$CRASP_NODE" "$CRASP_BIN" check --staged',
  ].join("\n");

  await mkdir(path.dirname(hookPath), { recursive: true });
  await writeFile(hookPath, `${content}\n`);
  await chmod(hookPath, 0o755);

  console.log(chalk.green("Installed Crasp pre-commit hook."));
}

async function uninstallHook(): Promise<void> {
  const status = await getHookStatus();

  if (!status.installed || !status.path) {
    console.log("No pre-commit hook installed.");
    return;
  }

  if (!status.managed) {
    console.log(chalk.yellow("Pre-commit hook is not managed by Crasp; leaving it in place."));
    return;
  }

  await rm(status.path);
  console.log(chalk.green("Removed Crasp pre-commit hook."));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
