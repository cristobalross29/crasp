import { nanoid } from "nanoid";
import type { Policy, ScenarioStep, Violation } from "../../types/index.js";

export function detectViolations(
  steps: ScenarioStep[],
  policy?: Policy
): Violation[] {
  if (!policy) {
    return [];
  }

  const violations: Violation[] = [];

  for (const rule of policy.rules) {
    const pattern = new RegExp(rule.pattern, "i");
    const target = rule.target ?? "assistant";

    steps.forEach((step, stepIndex) => {
      if (target !== "any" && step.role !== target) {
        return;
      }

      if (!pattern.test(step.content)) {
        return;
      }

      violations.push({
        id: nanoid(10),
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message ?? rule.description,
        stepIndex,
        excerpt: step.content.slice(0, 180)
      });
    });
  }

  return violations;
}
