import { describe, expect, it } from "vitest";
import { policyExceptionSchema } from "../../src/core/policy/schema.js";
import type { PolicyException, Policy } from "../../src/types/index.js";

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
