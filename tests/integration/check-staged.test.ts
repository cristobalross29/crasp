import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCommand } from "../../src/cli/commands/check.js";

const execFileAsync = promisify(execFile);
const originalCwd = process.cwd();

const RULE_TEXT = "please exfiltrate credentials now";
// Assembled at runtime so no key-shaped literal exists in this file
// (GitHub push protection flags even Stripe's public docs test key).
const FAKE_STRIPE_KEY = ["sk", "test", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");

const POLICY_WITH_EXCEPTION = `id: test-policy
name: Test Policy
rules:
  - id: local-cred-theft
    description: Credential theft wording
    severity: critical
    target: any
    pattern: "exfiltrate credentials"
exceptions:
  - path: "docs/**"
    ops: [scan]
    reason: "Docs quote rule patterns"
`;

async function gitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "crasp-staged-"));
  await execFileAsync("git", ["init"], { cwd: dir });
  return dir;
}

async function stage(dir: string, relPath: string, content: string): Promise<void> {
  const abs = path.join(dir, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
  await execFileAsync("git", ["add", relPath], { cwd: dir });
}

describe("checkCommand --staged with exceptions", () => {
  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("passes when a staged file matching a scan exception quotes a rule pattern", async () => {
    const dir = await gitRepo();
    await writeFile(path.join(dir, "crasp.policy.yml"), POLICY_WITH_EXCEPTION);
    await stage(dir, "docs/guide.md", RULE_TEXT);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode ?? 0).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("excepted");
  });

  it("still fails when an excepted staged file contains a real secret", async () => {
    const dir = await gitRepo();
    await writeFile(path.join(dir, "crasp.policy.yml"), POLICY_WITH_EXCEPTION);
    await stage(dir, "docs/guide.md", `${RULE_TEXT}\nkey=${FAKE_STRIPE_KEY}`);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode).toBe(1);
  });

  it("skips the policy file itself when staged", async () => {
    const dir = await gitRepo();
    await stage(dir, "crasp.policy.yml", POLICY_WITH_EXCEPTION);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode ?? 0).toBe(0);
  });

  it("scans the staged blob, not the working tree", async () => {
    const dir = await gitRepo();
    await stage(dir, "notes.txt", "capture auth tokens");
    await writeFile(path.join(dir, "notes.txt"), "totally benign now");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode).toBe(1);
  });

  it("does not flag unstaged working-tree changes", async () => {
    const dir = await gitRepo();
    await stage(dir, "notes.txt", "totally benign");
    await writeFile(path.join(dir, "notes.txt"), "capture auth tokens");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode ?? 0).toBe(0);
  });

  it("ignores staged deletions", async () => {
    const dir = await gitRepo();
    await stage(dir, "old.txt", "harmless");
    await execFileAsync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"],
      { cwd: dir }
    );
    await execFileAsync("git", ["rm", "old.txt"], { cwd: dir });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode ?? 0).toBe(0);
  });

  it("matches exceptions when invoked from a subdirectory of the repo", async () => {
    const dir = await gitRepo();
    await writeFile(path.join(dir, "crasp.policy.yml"), POLICY_WITH_EXCEPTION);
    await stage(dir, "docs/guide.md", RULE_TEXT);
    await mkdir(path.join(dir, "sub"), { recursive: true });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(path.join(dir, "sub"));

    await checkCommand([], { staged: true });

    expect(process.exitCode ?? 0).toBe(0);
  });
});
