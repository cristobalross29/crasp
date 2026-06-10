import { describe, expect, it } from "vitest";
import { policyExceptionSchema } from "../../src/core/policy/schema.js";
import type { PolicyException, Policy } from "../../src/types/index.js";
import { matchesException, matchesBashException } from "../../src/core/policy/exceptions.js";
import { redactCommand } from "../../src/core/scanner/redact.js";

describe("policyExceptionSchema", () => {
  it("parses a minimal exception with path only — ops defaults to ['any']", () => {
    const result = policyExceptionSchema.parse({ path: ".env.local" });
    expect(result.path).toBe(".env.local");
    expect(result.ops).toEqual(["any"]);
    expect(result.id).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("parses a full exception with all fields", () => {
    const result = policyExceptionSchema.parse({
      id: "allow-env-reads",
      path: ".env.local",
      ops: ["read"],
      reason: "Claude needs to read config",
    });
    expect(result.id).toBe("allow-env-reads");
    expect(result.path).toBe(".env.local");
    expect(result.ops).toEqual(["read"]);
    expect(result.reason).toBe("Claude needs to read config");
  });

  it("parses ops with multiple values", () => {
    const result = policyExceptionSchema.parse({
      path: "server.pem",
      ops: ["write", "edit"],
    });
    expect(result.ops).toEqual(["write", "edit"]);
  });

  it("rejects an empty path", () => {
    expect(() => policyExceptionSchema.parse({ path: "" })).toThrow();
  });

  it("rejects an exception with neither path nor command", () => {
    expect(() => policyExceptionSchema.parse({ ops: ["read"] })).toThrow();
  });

  it("rejects an empty command", () => {
    expect(() => policyExceptionSchema.parse({ command: "", ops: ["bash"] })).toThrow();
  });

  it("rejects empty ops array", () => {
    expect(() =>
      policyExceptionSchema.parse({ path: ".env.local", ops: [] })
    ).toThrow();
  });

  it("rejects invalid op value", () => {
    expect(() =>
      policyExceptionSchema.parse({ path: ".env.local", ops: ["delete"] })
    ).toThrow();
  });
});

describe("PolicyException and Policy types", () => {
  it("PolicyException accepts valid shape", () => {
    const ex: PolicyException = { path: ".env.local", ops: ["read", "write"] };
    expect(ex.path).toBe(".env.local");
  });

  it("PolicyException allows all optional fields", () => {
    const ex: PolicyException = {
      id: "my-exception",
      path: "*.pem",
      ops: ["any"],
      reason: "Deliberate access",
    };
    expect(ex.id).toBe("my-exception");
  });

  it("Policy type accepts exceptions array", () => {
    const policy: Policy = {
      id: "test",
      name: "Test",
      rules: [],
      exceptions: [{ path: ".env.local", ops: ["read"] }],
    };
    expect(policy.exceptions).toHaveLength(1);
  });
});

describe("bash command exceptions schema", () => {
  it("parses an exception with a command pattern and bash op", () => {
    const parsed = policyExceptionSchema.parse({
      command: "rm -rf node_modules",
      ops: ["bash"],
      reason: "routine cleanup",
    });
    expect(parsed.command).toBe("rm -rf node_modules");
    expect(parsed.ops).toEqual(["bash"]);
  });

  it("still parses a path-only exception with no command", () => {
    const parsed = policyExceptionSchema.parse({ path: ".env.local", ops: ["read"] });
    expect(parsed.command).toBeUndefined();
    expect(parsed.path).toBe(".env.local");
  });
});

describe("matchesException", () => {
  it("returns false for empty exceptions array", () => {
    expect(matchesException(".env.local", "Write", [])).toBe(false);
  });

  it("returns true when basename matches path glob and op matches exactly (Write → write)", () => {
    const exceptions: PolicyException[] = [
      { path: ".env.local", ops: ["write"] },
    ];
    expect(matchesException(".env.local", "Write", exceptions)).toBe(true);
  });

  it("returns true when op is 'any' in exceptions (any op matches)", () => {
    const exceptions: PolicyException[] = [
      { path: ".env.local", ops: ["any"] },
    ];
    expect(matchesException(".env.local", "Read", exceptions)).toBe(true);
  });

  it("returns false when path doesn't match (different basename)", () => {
    const exceptions: PolicyException[] = [
      { path: ".env.local", ops: ["write"] },
    ];
    expect(matchesException("config.ts", "Write", exceptions)).toBe(false);
  });

  it("returns false when path matches but op doesn't match (Read exception, Write op)", () => {
    const exceptions: PolicyException[] = [
      { path: ".env.local", ops: ["read"] },
    ];
    expect(matchesException(".env.local", "Write", exceptions)).toBe(false);
  });

  it("returns true for Edit op matching 'edit' exception", () => {
    const exceptions: PolicyException[] = [
      { path: "schema.ts", ops: ["edit"] },
    ];
    expect(matchesException("schema.ts", "Edit", exceptions)).toBe(true);
  });

  it("returns true for Read op matching 'read' exception", () => {
    const exceptions: PolicyException[] = [
      { path: "secrets.txt", ops: ["read"] },
    ];
    expect(matchesException("secrets.txt", "Read", exceptions)).toBe(true);
  });

  it("returns true when ops contains multiple values and current op is one of them", () => {
    const exceptions: PolicyException[] = [
      { path: ".env", ops: ["read", "write"] },
    ];
    expect(matchesException(".env", "Write", exceptions)).toBe(true);
  });

  it("returns true for glob pattern like .env* matching .env.local", () => {
    const exceptions: PolicyException[] = [
      { path: ".env*", ops: ["any"] },
    ];
    expect(matchesException(".env.local", "Write", exceptions)).toBe(true);
  });

  it("returns false for glob .env* when file is config.ts", () => {
    const exceptions: PolicyException[] = [
      { path: ".env*", ops: ["any"] },
    ];
    expect(matchesException("config.ts", "Write", exceptions)).toBe(false);
  });

  it("returns true for *.pem glob matching server.pem", () => {
    const exceptions: PolicyException[] = [
      { path: "*.pem", ops: ["any"] },
    ];
    expect(matchesException("server.pem", "Read", exceptions)).toBe(true);
  });

  it("returns false for *.pem glob when file is server.key (different extension)", () => {
    const exceptions: PolicyException[] = [
      { path: "*.pem", ops: ["any"] },
    ];
    expect(matchesException("server.key", "Read", exceptions)).toBe(false);
  });

  it("returns true when exceptions array has multiple entries, second one matches", () => {
    const exceptions: PolicyException[] = [
      { path: "unrelated.txt", ops: ["any"] },
      { path: ".env.local", ops: ["write"] },
    ];
    expect(matchesException(".env.local", "Write", exceptions)).toBe(true);
  });

  it("matches by basename only — full path /project/.env.local with pattern .env.local should match", () => {
    const exceptions: PolicyException[] = [
      { path: ".env.local", ops: ["any"] },
    ];
    expect(matchesException("/project/.env.local", "Read", exceptions)).toBe(true);
  });

  it("path-based exceptions do not fire for Bash calls (empty filePath)", () => {
    expect(matchesException("", "Bash", [{ path: ".env", ops: ["bash"] }])).toBe(false);
  });
});

describe("matchesBashException", () => {
  const ex: PolicyException[] = [{ command: "rm -rf node_modules", ops: ["bash"] }];

  it("matches a command against a bash exception regex", () => {
    expect(matchesBashException("rm -rf node_modules", ex)).toBe(true);
  });

  it("does not match a different command", () => {
    expect(matchesBashException("rm -rf /etc", ex)).toBe(false);
  });

  it("ignores exceptions with no command field", () => {
    expect(matchesBashException("rm -rf x", [{ path: ".env", ops: ["any"] }])).toBe(false);
  });

  it("honours the 'any' op", () => {
    expect(matchesBashException("ls", [{ command: "^ls$", ops: ["any"] }])).toBe(true);
  });

  it("treats an invalid regex as non-matching (fail closed)", () => {
    expect(matchesBashException("anything", [{ command: "([", ops: ["bash"] }])).toBe(false);
  });
});

describe("redactCommand", () => {
  it("redacts an OpenAI-style key in a command", () => {
    const out = redactCommand('curl -H "Authorization: Bearer sk-proj-ABCDEF1234567890abcdef"');
    expect(out).not.toContain("sk-proj-ABCDEF1234567890abcdef");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a GitHub PAT", () => {
    const out = redactCommand("git clone https://github_pat_11ABCDEFGHIJ1234567890abcdefgh@github.com/x/y");
    expect(out).not.toContain("github_pat_11ABCDEFGHIJ1234567890abcdefgh");
  });

  it("leaves a clean command unchanged", () => {
    expect(redactCommand("rm -rf build")).toBe("rm -rf build");
  });

  it("produces the same output on repeated calls (no lastIndex statefulness bug)", () => {
    const cmd = 'curl -H "Authorization: Bearer sk-proj-ABCDEF1234567890abcdef"';
    expect(redactCommand(cmd)).toBe(redactCommand(cmd));
  });

  it("does not redact kebab-case words that merely end in sk-", () => {
    expect(redactCommand("pnpm test task-1234567890abcdef01234567")).toBe(
      "pnpm test task-1234567890abcdef01234567"
    );
  });
});
