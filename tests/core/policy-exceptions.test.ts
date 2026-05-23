import { describe, expect, it } from "vitest";
import { policyExceptionSchema } from "../../src/core/policy/schema.js";
import type { PolicyException, Policy } from "../../src/types/index.js";
import { matchesException } from "../../src/core/policy/exceptions.js";

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

  it("rejects missing path", () => {
    expect(() => policyExceptionSchema.parse({ ops: ["read"] })).toThrow();
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
});
