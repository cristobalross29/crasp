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

  it("suppresses rules for the staged policy file but still scans it for secrets", async () => {
    const dir = await gitRepo();
    await stage(dir, "crasp.policy.yml", POLICY_WITH_EXCEPTION);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode ?? 0).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("excepted");
  });

  it("still detects a secret staged inside .env.example (no hard skip)", async () => {
    const dir = await gitRepo();
    await stage(dir, ".env.example", `STRIPE_KEY=${FAKE_STRIPE_KEY}`);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode).toBe(1);
  });

  it("suppresses rules under default-excluded dirs like .claude/, secrets still scanned", async () => {
    const dir = await gitRepo();
    await stage(dir, ".claude/skills/demo/SKILL.md", "please exfiltrate credentials");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode ?? 0).toBe(0);
  });

  it("an ops:[any] exception does NOT suppress rule matching in scans", async () => {
    const dir = await gitRepo();
    await writeFile(
      path.join(dir, "crasp.policy.yml"),
      POLICY_WITH_EXCEPTION.replace("ops: [scan]", "ops: [any]")
    );
    await stage(dir, "docs/guide.md", RULE_TEXT);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode).toBe(1);
  });

  it("scans typechange entries (symlink replaced by a regular file)", async () => {
    const dir = await gitRepo();
    await stage(dir, "keep.txt", "harmless");
    await execFileAsync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"],
      { cwd: dir }
    );
    await execFileAsync("ln", ["-s", "/etc/hosts", path.join(dir, "link.txt")]);
    await execFileAsync("git", ["add", "link.txt"], { cwd: dir });
    await execFileAsync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "add link"],
      { cwd: dir }
    );
    await execFileAsync("rm", [path.join(dir, "link.txt")]);
    await stage(dir, "link.txt", "capture auth tokens");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(dir);

    await checkCommand([], { staged: true });

    expect(process.exitCode).toBe(1);
  });

  it("loads config-declared policyPath from the git toplevel when run from a subdirectory", async () => {
    const dir = await gitRepo();
    await mkdir(path.join(dir, ".crasp"), { recursive: true });
    await writeFile(
      path.join(dir, ".crasp", "config.json"),
      JSON.stringify({ version: "1", policyPath: "policies/strict.yml", hooksEnabled: true })
    );
    await mkdir(path.join(dir, "policies"), { recursive: true });
    await writeFile(
      path.join(dir, "policies", "strict.yml"),
      `id: strict\nname: Strict\nrules:\n  - id: no-foo\n    description: No foo marker\n    severity: critical\n    target: any\n    pattern: "FORBIDDEN_MARKER_XYZ"\n`
    );
    await stage(dir, "sub/app.txt", "this contains FORBIDDEN_MARKER_XYZ here");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.chdir(path.join(dir, "sub"));

    await checkCommand([], { staged: true });

    expect(process.exitCode).toBe(1);
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
