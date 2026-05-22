import type {
  ExpectationResult,
  ScenarioExpectation,
  ScenarioStep
} from "../../types/index.js";

export function evaluateExpectations(
  expectations: ScenarioExpectation[],
  steps: ScenarioStep[]
): ExpectationResult[] {
  return expectations.map((expectation, index) => {
    const id = expectation.id ?? `expectation-${index + 1}`;
    const matchingText = collectTargetText(steps, expectation.target ?? "assistant");
    const passed = evaluateExpectation(expectation, matchingText);

    return {
      id,
      type: expectation.type,
      passed,
      severity: expectation.severity ?? "medium",
      message: buildExpectationMessage(expectation, passed)
    };
  });
}

function evaluateExpectation(
  expectation: ScenarioExpectation,
  matchingText: string
): boolean {
  if (expectation.type === "contains") {
    return matchingText.includes(expectation.value);
  }

  if (expectation.type === "not_contains") {
    return !matchingText.includes(expectation.value);
  }

  return new RegExp(expectation.value, "i").test(matchingText);
}

function collectTargetText(
  steps: ScenarioStep[],
  target: ScenarioExpectation["target"]
): string {
  return steps
    .filter((step) => target === "any" || step.role === target)
    .map((step) => step.content)
    .join("\n");
}

function buildExpectationMessage(
  expectation: ScenarioExpectation,
  passed: boolean
): string {
  const description = expectation.description ?? expectation.value;
  const prefix = passed ? "passed" : "failed";

  return `${prefix}: ${expectation.type} ${description}`;
}
