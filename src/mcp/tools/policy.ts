import type { Policy, PolicyRule } from "../../types/index.js";

interface PolicyResult {
  policyId: string;
  policyName: string;
  totalRules: number;
  rules: Omit<PolicyRule, "pattern">[];
}

// Read-only display descriptor for the built-in secret detector (secrets.ts).
// Not a runnable PolicyRule — it does not participate in scanContent.
const SECRET_DETECTION_DESCRIPTOR: Omit<PolicyRule, "pattern"> = {
  id: "secret-detection",
  description: "Built-in secret detection (code) — provider patterns + generic entropy via secrets.ts.",
  severity: "critical",
  target: "any",
  message: "Secret detected.",
};

export async function handlePolicy(policy: Policy): Promise<PolicyResult> {
  const rules: Omit<PolicyRule, "pattern">[] = [
    ...policy.rules.map(({ pattern: _p, ...rest }) => rest),
    SECRET_DETECTION_DESCRIPTOR,
  ];
  return {
    policyId: policy.id,
    policyName: policy.name,
    // totalRules intentionally includes the synthetic secret-detection descriptor (builtin rules + 1).
    totalRules: rules.length,
    rules,
  };
}
