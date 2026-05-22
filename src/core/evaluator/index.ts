import { evaluateExpectations } from "../expectations/index.js";
import { detectViolations } from "../violations/detector.js";
import type {
  ExpectationResult,
  Policy,
  Scenario,
  Violation
} from "../../types/index.js";

export interface EvaluationResult {
  expectations: ExpectationResult[];
  violations: Violation[];
  passed: boolean;
}

export function evaluateScenario(
  scenario: Scenario,
  policy?: Policy
): EvaluationResult {
  const expectations = evaluateExpectations(
    scenario.expectations ?? [],
    scenario.steps
  );
  const violations = detectViolations(scenario.steps, policy);
  const passed =
    expectations.every((expectation) => expectation.passed) &&
    violations.length === 0;

  return {
    expectations,
    violations,
    passed
  };
}
