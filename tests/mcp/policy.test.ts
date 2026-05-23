import { describe, it, expect } from "vitest";
import { handlePolicy } from "../../src/mcp/tools/policy.js";
import type { Policy } from "../../src/types/index.js";

const TEST_POLICY: Policy = {
  id: "test",
  name: "Test Policy",
  rules: [
    {
      id: "token-leakage",
      description: "Sensitive token",
      severity: "critical",
      pattern: "sk-[a-z0-9]{20,}",
      target: "any",
    },
    {
      id: "jailbreak-attempt",
      description: "Jailbreak framing",
      severity: "medium",
      pattern: "developer mode",
      target: "any",
    },
  ],
};

describe("handlePolicy", () => {
  it("returns all rules from the policy", async () => {
    const result = await handlePolicy(TEST_POLICY);
    expect(result.rules).toHaveLength(TEST_POLICY.rules.length);
  });

  it("returns the correct rule ids", async () => {
    const result = await handlePolicy(TEST_POLICY);
    const ids = result.rules.map((r) => r.id);
    expect(ids).toContain("token-leakage");
    expect(ids).toContain("jailbreak-attempt");
  });

  it("returns policyId and policyName", async () => {
    const result = await handlePolicy(TEST_POLICY);
    expect(result.policyId).toBe("test");
    expect(result.policyName).toBe("Test Policy");
  });

  it("returns totalRules count", async () => {
    const result = await handlePolicy(TEST_POLICY);
    expect(result.totalRules).toBe(2);
  });
});
