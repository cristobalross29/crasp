import { describe, it, expect } from "vitest";
import { handlePolicy } from "../../src/mcp/tools/policy.js";
import { mergeWithBuiltin } from "../../src/core/patterns/index.js";
import type { Policy } from "../../src/types/index.js";

const TEST_POLICY: Policy = {
  id: "test",
  name: "Test Policy",
  rules: [
    {
      id: "jailbreak-attempt",
      description: "Jailbreak framing",
      severity: "medium",
      pattern: "developer mode",
      target: "any",
    },
    {
      id: "custom-rule",
      description: "A custom rule",
      severity: "low",
      pattern: "custom",
      target: "any",
    },
  ],
};

describe("handlePolicy", () => {
  it("returns all rules from the policy plus the secret-detection descriptor", async () => {
    const result = await handlePolicy(TEST_POLICY);
    expect(result.rules).toHaveLength(TEST_POLICY.rules.length + 1);
  });

  it("includes the secret-detection synthetic descriptor", async () => {
    const result = await handlePolicy(TEST_POLICY);
    const descriptor = result.rules.find((r) => r.id === "secret-detection");
    expect(descriptor).toBeDefined();
    expect(descriptor!.severity).toBe("critical");
  });

  it("returns the correct non-synthetic rule ids", async () => {
    const result = await handlePolicy(TEST_POLICY);
    const ids = result.rules.map((r) => r.id);
    expect(ids).toContain("jailbreak-attempt");
    expect(ids).toContain("custom-rule");
  });

  it("returns policyId and policyName", async () => {
    const result = await handlePolicy(TEST_POLICY);
    expect(result.policyId).toBe("test");
    expect(result.policyName).toBe("Test Policy");
  });

  it("strips the pattern field from every rule", async () => {
    const result = await handlePolicy(TEST_POLICY);
    expect(result.rules.every((r) => !("pattern" in r))).toBe(true);
  });

  it("keeps all other rule fields intact after stripping pattern", async () => {
    const result = await handlePolicy(TEST_POLICY);
    const rule = result.rules.find((r) => r.id === "custom-rule");
    expect(rule).toBeDefined();
    expect(rule?.description).toBe("A custom rule");
    expect(rule?.severity).toBe("low");
  });
});

describe("handlePolicy — R4/R5: legacy id reservation and secret-detection visibility", () => {
  it("ignores a user-supplied token-leakage rule when using mergeWithBuiltin", async () => {
    const userPolicy: Policy = {
      id: "user",
      name: "User Policy",
      rules: [
        {
          id: "token-leakage",
          description: "User attempt to resurrect legacy id",
          severity: "critical",
          pattern: "sk-[a-z]{20,}",
        },
      ],
    };
    const merged = mergeWithBuiltin(userPolicy);
    const result = await handlePolicy(merged);
    const ids = result.rules.map((r) => r.id);
    expect(ids).not.toContain("token-leakage");
  });

  it("includes secret-detection descriptor when using mergeWithBuiltin", async () => {
    const merged = mergeWithBuiltin();
    const result = await handlePolicy(merged);
    const descriptor = result.rules.find((r) => r.id === "secret-detection");
    expect(descriptor).toBeDefined();
    expect(descriptor!.severity).toBe("critical");
  });
});
