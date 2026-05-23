import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve("dist/index.js");

function makePayload(toolInput: Record<string, unknown>): string {
  return JSON.stringify({ tool_input: toolInput });
}

function parseDeny(stdout: string): { isDeny: boolean; reason: string } {
  try {
    const json = JSON.parse(stdout.trim()) as {
      hookSpecificOutput?: {
        permissionDecision?: string;
        permissionDecisionReason?: string;
      };
    };
    const out = json.hookSpecificOutput ?? {};
    return {
      isDeny: out.permissionDecision === "deny",
      reason: out.permissionDecisionReason ?? "",
    };
  } catch {
    return { isDeny: false, reason: "" };
  }
}

describe("check --hook-input Write", () => {
  it("denies writing to .env.local (sensitive path)", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Write"],
      { input: makePayload({ file_path: "/project/.env.local", content: "NEW_VAR=test" }), encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    const { isDeny, reason } = parseDeny(result.stdout);
    expect(isDeny).toBe(true);
    expect(reason).toContain("sensitive-env-file");
    expect(reason).toContain("high");
  });

  it("denies writing to .env", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Write"],
      { input: makePayload({ file_path: "/project/.env", content: "X=1" }), encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    expect(parseDeny(result.stdout).isDeny).toBe(true);
  });

  it("allows writing to .env.example (template file)", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Write"],
      { input: makePayload({ file_path: "/project/.env.example", content: "API_KEY=your-key" }), encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    expect(parseDeny(result.stdout).isDeny).toBe(false);
    expect(result.stdout).toBe("");
  });

  it("denies when written content contains a leaked API token", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Write"],
      {
        input: makePayload({
          file_path: "/project/config.ts",
          content: "const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';",
        }),
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(0);
    const { isDeny, reason } = parseDeny(result.stdout);
    expect(isDeny).toBe(true);
    expect(reason).toContain("token-leakage");
  });

  it("exits 0 with no output for clean write to a safe file", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Write"],
      {
        input: makePayload({ file_path: "/project/src/index.ts", content: "export const x = 1;" }),
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});

describe("check --hook-input Edit", () => {
  it("denies editing .env.local", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Edit"],
      {
        input: makePayload({
          file_path: "/project/.env.local",
          old_string: "OLD=1",
          new_string: "NEW=2",
        }),
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(0);
    const { isDeny, reason } = parseDeny(result.stdout);
    expect(isDeny).toBe(true);
    expect(reason).toContain("sensitive-env-file");
  });

  it("denies editing a .pem file", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Edit"],
      {
        input: makePayload({
          file_path: "/certs/server.pem",
          old_string: "-----BEGIN CERTIFICATE-----",
          new_string: "-----BEGIN CERTIFICATE-----\nEXTRA",
        }),
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(0);
    const { isDeny, reason } = parseDeny(result.stdout);
    expect(isDeny).toBe(true);
    expect(reason).toContain("sensitive-key-file");
  });

  it("denies when new_string contains a leaked token", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Edit"],
      {
        input: makePayload({
          file_path: "/project/config.ts",
          old_string: "const key = '';",
          new_string: "const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';",
        }),
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(0);
    expect(parseDeny(result.stdout).isDeny).toBe(true);
  });

  it("exits 0 with no output for a clean edit to a safe file", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Edit"],
      {
        input: makePayload({
          file_path: "/project/src/utils.ts",
          old_string: "const x = 1;",
          new_string: "const x = 2;",
        }),
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("check --hook-input Read", () => {
  it("exits 0 with advisory JSON (no deny) when reading .env.local", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Read"],
      { input: makePayload({ file_path: "/project/.env.local" }), encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    // Must be advisory (not a deny) — user may legitimately read the file
    const { isDeny } = parseDeny(result.stdout);
    expect(isDeny).toBe(false);
    // Must include warning context for Claude
    const parsed = JSON.parse(result.stdout.trim()) as { hookSpecificOutput?: { additionalContext?: string } };
    expect(parsed.hookSpecificOutput?.additionalContext).toContain("WARNING");
    expect(parsed.hookSpecificOutput?.additionalContext).toContain("sensitive-env-file");
  });

  it("denies reading a .pem certificate file", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Read"],
      { input: makePayload({ file_path: "/certs/server.pem" }), encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    const { isDeny, reason } = parseDeny(result.stdout);
    expect(isDeny).toBe(true);
    expect(reason).toContain("sensitive-key-file");
  });

  it("exits 0 silently for reading a safe file", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Read"],
      { input: makePayload({ file_path: "/project/src/index.ts" }), encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });
});

describe("check --hook-input edge cases", () => {
  it("exits 0 for malformed JSON payload (fail open, never false-block)", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Write"],
      { input: "not valid json", encoding: "utf8" }
    );
    expect(result.status).toBe(0);
  });

  it("exits 0 when payload has no file_path", () => {
    const result = spawnSync(
      "node",
      [CLI, "check", "--hook-input", "Write"],
      { input: JSON.stringify({ tool_input: { content: "export const x = 1;" } }), encoding: "utf8" }
    );
    expect(result.status).toBe(0);
  });
});
