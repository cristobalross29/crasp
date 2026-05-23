import { describe, it, expect } from "vitest";
import type { PolicyException, Policy } from "../../src/types/index.js";

describe("PolicyException type", () => {
  it("accepts a valid exception object", () => {
    const ex: PolicyException = {
      path: ".env.local",
      ops: ["read", "write"],
    };
    expect(ex.path).toBe(".env.local");
  });

  it("accepts optional id and reason", () => {
    const ex: PolicyException = {
      id: "allow-env",
      path: ".env*",
      ops: ["any"],
      reason: "intentional",
    };
    expect(ex.id).toBe("allow-env");
  });

  it("Policy type accepts exceptions array", () => {
    const p: Policy = {
      id: "test",
      name: "Test",
      rules: [],
      exceptions: [{ path: ".env.local", ops: ["read"] }],
    };
    expect(p.exceptions).toHaveLength(1);
  });
});
