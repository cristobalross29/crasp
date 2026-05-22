import chalk from "chalk";
import Table from "cli-table3";
import type { RunReport } from "../types/index.js";

export function renderTerminalReport(report: RunReport): string {
  const status =
    report.status === "passed" ? chalk.green("passed") : chalk.red("failed");
  const summary = new Table({
    head: ["Run", "Scenario", "Status", "Steps", "Expectations", "Violations"]
  });

  summary.push([
    report.runId,
    report.scenarioName,
    status,
    report.summary.steps,
    `${report.summary.passedExpectations}/${report.summary.expectations}`,
    report.summary.violations
  ]);

  const lines = [summary.toString()];

  if (report.violations.length > 0) {
    const violations = new Table({
      head: ["Severity", "Rule", "Message"]
    });

    report.violations.forEach((violation) => {
      violations.push([
        violation.severity,
        violation.ruleId ?? violation.expectationId ?? "n/a",
        violation.message
      ]);
    });

    lines.push(violations.toString());
  }

  return lines.join("\n");
}
