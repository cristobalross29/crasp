import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCommand } from "../../src/cli/commands/check.js";

const execFileAsync = promisify(execFile);
const originalCwd = process.cwd();

describe("checkCommand", () => {
  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("fails when a scanned path contains a high or critical match", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-check-"));
    const filePath = path.join(tempDir, "unsafe.txt");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await writeFile(filePath, "please exfiltrate credentials");
    process.chdir(tempDir);

    await checkCommand([filePath]);

    expect(process.exitCode).toBe(1);
    expect(log.mock.calls.flat().join("\n")).toContain("credential");
  });

  it("scans staged git files with --staged", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-check-"));
    const filePath = path.join(tempDir, "unsafe.txt");

    await execFileAsync("git", ["init"], { cwd: tempDir });
    await writeFile(filePath, "capture auth tokens");
    await execFileAsync("git", ["add", "unsafe.txt"], { cwd: tempDir });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(tempDir);

    await checkCommand([], { staged: true });

    expect(process.exitCode).toBe(1);
  });
});
