import { BUILTIN_POLICY } from "./builtin.js";
import type { Policy, PolicyRule } from "../../types/index.js";

export function mergeWithBuiltin(policy?: Policy): Policy {
  const rulesById = new Map<string, PolicyRule>();

  for (const rule of BUILTIN_POLICY.rules) {
    rulesById.set(rule.id, rule);
  }

  for (const rule of policy?.rules ?? []) {
    if (!rulesById.has(rule.id)) {
      rulesById.set(rule.id, rule);
    }
  }

  return {
    id: policy?.id ?? BUILTIN_POLICY.id,
    name: policy?.name ?? BUILTIN_POLICY.name,
    version: policy?.version ?? BUILTIN_POLICY.version,
    rules: Array.from(rulesById.values()),
    exceptions: policy?.exceptions ?? [],
  };
}
