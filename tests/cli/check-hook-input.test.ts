import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runGuarded } from "../../src/cli/commands/check.js";

const CLI = path.resolve("dist/index.js");

function makePayload(toolInput: Record<string, unknown>): string {
  return JSON.stringify({ tool_input: toolInput });
}

function parseOutput(stdout: string): {
  isDeny: boolean;
  isAsk: boolean;
  isAdvisory: boolean;
  reason: string;
  additionalContext: string;
} {
  try {
    const json = JSON.parse(stdout.trim()) as {
      hookSpecificOutput?: {
        permissionDecision?: string;
        permissionDecisionReason?: string;
        additionalContext?: string;
      };
    };
    const out = json.hookSpecificOutput ?? {};
    return {
      isDeny: out.permissionDecision === "deny",
      isAsk: out.permissionDecision === "ask",
      isAdvisory: typeof out.additionalContext === "string" && out.additionalContext.length > 0,
      reason: out.permissionDecisionReason ?? "",
      additionalContext: out.additionalContext ?? "",
    };
  } catch {
    return { isDeny: false, isAsk: false, isAdvisory: false, reason: "", additionalContext: "" };
  }
}

describe("check --hook-input Write", () => {
  it("shows ask dialog (high) when writing to .env.local", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/.env.local", content: "NEW_VAR=test" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(true);
    expect(out.reason).toContain("⚠️");
    expect(out.reason).toContain(".env.local");
  });

  it("shows ask dialog (high) when writing to .env", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/.env", content: "X=1" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(parseOutput(result.stdout).isAsk).toBe(true);
  });

  it("allows writing to .env.example (template file)", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/.env.example", content: "API_KEY=your-key" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(false);
    expect(out.isDeny).toBe(false);
    expect(result.stdout).toBe("");
  });

  it("denies when written content contains a leaked API token", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({
        file_path: "/project/config.ts",
        content: "const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(parseOutput(result.stdout).isDeny).toBe(true);
  });

  it("exits 0 with no output for clean write to a safe file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/src/index.ts", content: "export const x = 1;" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});

describe("check --hook-input Edit", () => {
  it("shows ask dialog (high) when editing .env.local", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Edit"], {
      input: makePayload({
        file_path: "/project/.env.local",
        old_string: "OLD=1",
        new_string: "NEW=2",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(true);
    expect(out.reason).toContain("⚠️");
  });

  it("shows ask dialog (critical) when editing a .pem file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Edit"], {
      input: makePayload({
        file_path: "/certs/server.pem",
        old_string: "-----BEGIN CERTIFICATE-----",
        new_string: "-----BEGIN CERTIFICATE-----\nEXTRA",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(true);
    expect(out.reason).toContain("🚨");
  });

  it("denies when new_string contains a leaked token", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Edit"], {
      input: makePayload({
        file_path: "/project/config.ts",
        old_string: "const key = '';",
        new_string: "const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(parseOutput(result.stdout).isDeny).toBe(true);
  });

  it("exits 0 with no output for a clean edit to a safe file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Edit"], {
      input: makePayload({
        file_path: "/project/src/utils.ts",
        old_string: "const x = 1;",
        new_string: "const x = 2;",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("check --hook-input Read", () => {
  it("returns advisory (not deny, not ask) when reading .env.local", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Read"], {
      input: makePayload({ file_path: "/project/.env.local" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isDeny).toBe(false);
    expect(out.isAsk).toBe(false);
    expect(out.isAdvisory).toBe(true);
    expect(out.additionalContext).toContain(".env.local");
    expect(out.additionalContext).toContain("Crasp");
  });

  it("shows ask dialog (critical) when reading a .pem file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Read"], {
      input: makePayload({ file_path: "/certs/server.pem" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(true);
    expect(out.reason).toContain("🚨");
  });

  it("exits 0 silently for reading a safe file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Read"], {
      input: makePayload({ file_path: "/project/src/index.ts" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });
});

describe("check --hook-input exceptions bypass", () => {
  it("exits silently when file matches a policy exception (write op)", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-exception-e2e-"));
    const policyPath = path.join(tmpDir, "crasp.policy.yml");
    try {
      await writeFile(
        policyPath,
        `id: test-policy\nname: Test\nrules: []\nexceptions:\n  - path: ".env.local"\n    ops: [write, edit]\n    reason: "Deliberate access"\n`
      );
      const result = spawnSync(
        "node",
        [CLI, "check", "--hook-input", "Write"],
        {
          input: makePayload({ file_path: "/project/.env.local", content: "X=1" }),
          encoding: "utf8",
          cwd: tmpDir,
        }
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("still fires ask dialog when op is NOT in the exception", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-exception-op-mismatch-"));
    const policyPath = path.join(tmpDir, "crasp.policy.yml");
    try {
      await writeFile(
        policyPath,
        `id: test-policy\nname: Test\nrules: []\nexceptions:\n  - path: ".env.local"\n    ops: [read]\n`
      );
      const result = spawnSync(
        "node",
        [CLI, "check", "--hook-input", "Write"],
        {
          input: makePayload({ file_path: "/project/.env.local", content: "X=1" }),
          encoding: "utf8",
          cwd: tmpDir,
        }
      );
      expect(result.status).toBe(0);
      expect(parseOutput(result.stdout).isAsk).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("check --hook-input edge cases", () => {
  it("exits 0 for malformed JSON payload (fail open)", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: "not valid json",
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });

  it("exits 0 when payload has no file_path", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: JSON.stringify({ tool_input: { content: "export const x = 1;" } }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });

  // Fix 4a: null JSON payload must not crash
  it("exits 0 with no output when payload is JSON null (Write)", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: "null",
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("exits 0 with no output when payload is JSON null (Bash)", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Bash"], {
      input: "null",
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  // Fix 4b: malformed user crasp.policy.yml must fall back to builtin (not crash)
  it("exits 0 on clean command when policy YAML is malformed (builtin fallback)", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-bad-policy-"));
    try {
      await writeFile(path.join(tmpDir, "crasp.policy.yml"), ":::not yaml:::\n");
      const result = spawnSync(
        "node",
        [CLI, "check", "--hook-input", "Bash"],
        {
          input: makePayload({ command: "ls -la" }),
          encoding: "utf8",
          cwd: tmpDir,
        }
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("still fires ask on rm -rf when policy YAML is malformed (builtin active)", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-bad-policy-rmrf-"));
    try {
      await writeFile(path.join(tmpDir, "crasp.policy.yml"), ":::not yaml:::\n");
      const result = spawnSync(
        "node",
        [CLI, "check", "--hook-input", "Bash"],
        {
          input: makePayload({ command: "rm -rf /tmp/x" }),
          encoding: "utf8",
          cwd: tmpDir,
        }
      );
      expect(result.status).toBe(0);
      expect(parseOutput(result.stdout).isAsk).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("check --hook-input redaction", () => {
  it("deny reason does not contain the raw API token", () => {
    const rawToken = "sk-abcdefghijklmnopqrstuvwxyz123456";
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({
        file_path: "/project/config.ts",
        content: `const key = '${rawToken}';`,
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isDeny).toBe(true);
    expect(out.reason).not.toContain(rawToken);
    expect(out.reason).toContain("[REDACTED]");
  });
});

describe("check --hook-input exceptions + content scan", () => {
  it("denies when an excepted path has violating content", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-exception-deny-"));
    try {
      await writeFile(
        path.join(tmpDir, "crasp.policy.yml"),
        `id: test-policy\nname: Test\nrules: []\nexceptions:\n  - path: ".env.local"\n    ops: [write, edit]\n    reason: "Deliberate access"\n`
      );
      const result = spawnSync(
        "node",
        [CLI, "check", "--hook-input", "Write"],
        {
          input: makePayload({
            file_path: "/project/.env.local",
            content: "SECRET=sk-abcdefghijklmnopqrstuvwxyz123456",
          }),
          encoding: "utf8",
          cwd: tmpDir,
        }
      );
      expect(result.status).toBe(0);
      expect(parseOutput(result.stdout).isDeny).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("exits silently when excepted file has clean content", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-exception-clean-"));
    try {
      await writeFile(
        path.join(tmpDir, "crasp.policy.yml"),
        `id: test-policy\nname: Test\nrules: []\nexceptions:\n  - path: ".env.local"\n    ops: [write, edit]\n    reason: "Deliberate access"\n`
      );
      const result = spawnSync(
        "node",
        [CLI, "check", "--hook-input", "Write"],
        {
          input: makePayload({ file_path: "/project/.env.local", content: "PORT=3000" }),
          encoding: "utf8",
          cwd: tmpDir,
        }
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("Bash hook input", () => {
  it("asks on rm -rf", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Bash"], {
      input: makePayload({ command: "rm -rf build" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(true);
    expect(out.reason).toContain("rm -rf build");
  });

  it("asks on a secret leaked in the command (redacted in reason)", () => {
    const rawToken = "sk-abcdefghijklmnopqrstuvwxyz123456";
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Bash"], {
      input: makePayload({ command: `echo "${rawToken}"` }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(true);
    expect(out.reason).not.toContain(rawToken);
    expect(out.reason).toContain("[REDACTED]");
  });

  it("emits additionalContext (no ask) on a plain outbound fetch", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Bash"], {
      input: makePayload({ command: "curl https://api.example.com" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAdvisory).toBe(true);
    expect(out.isAsk).toBe(false);
  });

  it("stays silent (clean) on a harmless command", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Bash"], {
      input: makePayload({ command: "ls -la" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("bypasses an excepted command", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-bash-exception-"));
    try {
      await writeFile(
        path.join(tmpDir, "crasp.policy.yml"),
        [
          "id: test-policy",
          "name: Test",
          "rules: []",
          "exceptions:",
          '  - command: "^rm -rf node_modules$"',
          "    ops: [bash]",
        ].join("\n") + "\n"
      );
      const result = spawnSync(
        "node",
        [CLI, "check", "--hook-input", "Bash"],
        {
          input: makePayload({ command: "rm -rf node_modules" }),
          encoding: "utf8",
          cwd: tmpDir,
        }
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("redacts secrets embedded in ask-tier rule messages", () => {
    const rawToken = "sk-proj-ABCDEF1234567890abcdef";
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Bash"], {
      input: makePayload({ command: `sudo echo ${rawToken}` }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(true);
    expect(out.reason).not.toContain(rawToken);
    expect(out.reason).toContain("[REDACTED]");
  });

  it("redacts secrets in the advisory prefix of a secret-scan ask", () => {
    const rawToken = "sk-abcdefghijklmnopqrstuvwxyz123456";
    const command = `curl https://api.example.com -H "Authorization: Bearer ${rawToken}"`;
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Bash"], {
      input: makePayload({ command }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const out = parseOutput(result.stdout);
    expect(out.isAsk).toBe(true);
    expect(out.reason).not.toContain(rawToken);
  });

  it("exits cleanly on a non-string command payload", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Bash"], {
      input: makePayload({ command: 12345 }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("logs the command redacted in .crasp/events.ndjson", async () => {
    const rawToken = "sk-abcdefghijklmnopqrstuvwxyz123456";
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "af-bash-log-"));
    try {
      const result = spawnSync(
        "node",
        [CLI, "check", "--hook-input", "Bash"],
        {
          input: makePayload({ command: `echo "${rawToken}"` }),
          encoding: "utf8",
          cwd: tmpDir,
        }
      );
      expect(result.status).toBe(0);
      const logPath = path.join(tmpDir, ".crasp", "events.ndjson");
      const logRaw = await readFile(logPath, "utf8");
      const entry = JSON.parse(logRaw.trim()) as {
        tool: string;
        filePath: string;
      };
      expect(entry.tool).toBe("Bash");
      expect(entry.filePath).not.toContain(rawToken);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("runGuarded", () => {
  it("swallows throws and exits 0", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await runGuarded(async () => { throw new Error("boom"); });
    expect(exit).toHaveBeenCalledWith(0);
    exit.mockRestore();
  });
});
