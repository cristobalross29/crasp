import type { Policy, PolicyRule } from "../../types/index.js";

interface PolicyResult {
  policyId: string;
  policyName: string;
  totalRules: number;
  rules: Omit<PolicyRule, "pattern">[];
}

export async function handlePolicy(policy: Policy): Promise<PolicyResult> {
  return {
    policyId: policy.id,
    policyName: policy.name,
    totalRules: policy.rules.length,
    rules: policy.rules.map(({ pattern: _p, ...rest }) => rest),
  };
}
