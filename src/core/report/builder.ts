import type { EvaluationResult } from "../evaluator/index.js";
import type { RunReport, Scenario } from "../../types/index.js";

export interface BuildReportInput {
  runId: string;
  scenario: Scenario;
  scenarioPath: string;
  policyPath?: string;
  startedAt: Date;
  completedAt: Date;
  evaluation: EvaluationResult;
}

export function buildRunReport(input: BuildReportInput): RunReport {
  const failedExpectations = input.evaluation.expectations.filter(
    (expectation) => !expectation.passed
  ).length;

  return {
    runId: input.runId,
    scenarioPath: input.scenarioPath,
    policyPath: input.policyPath,
    scenarioName: input.scenario.name,
    status: input.evaluation.passed ? "passed" : "failed",
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    summary: {
      steps: input.scenario.steps.length,
      expectations: input.evaluation.expectations.length,
      passedExpectations:
        input.evaluation.expectations.length - failedExpectations,
      failedExpectations,
      violations: input.evaluation.violations.length
    },
    expectations: input.evaluation.expectations,
    violations: input.evaluation.violations
  };
}
