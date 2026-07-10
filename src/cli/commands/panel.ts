import { spawn } from "node:child_process";
import chalk from "chalk";
import { startPanelServer } from "../../core/panel/server.js";
import { getInstallHealth } from "./status.js";

interface PanelOptions {
  port?: string;
  open?: boolean; // commander --no-open ⇒ false
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore", shell: process.platform === "win32" }).unref();
  } catch {
    // Browser open is best-effort — the URL is already printed.
  }
}

export async function panelCommand(options: PanelOptions = {}): Promise<void> {
  const port = options.port !== undefined ? Number(options.port) : 4269;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(chalk.red(`Invalid port: ${options.port}`));
    process.exitCode = 1;
    return;
  }

  let server;
  try {
    server = await startPanelServer({ port, getProjectHealth: getInstallHealth });
  } catch (error) {
    console.error(chalk.red(
      `Could not start the panel on port ${port} (${error instanceof Error ? error.message : String(error)}).\n` +
      `Try another port: crasp panel --port 4270`
    ));
    process.exitCode = 1;
    return;
  }

  const url = `http://127.0.0.1:${server.port}`;
  console.log(`crasp panel listening at ${url}`);
  console.log(chalk.dim("Press Ctrl+C to stop."));
  if (options.open !== false) openBrowser(url);
}
