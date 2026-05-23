import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

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
    expect(out.additionalContext).toContain("AgentFence");
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
});
