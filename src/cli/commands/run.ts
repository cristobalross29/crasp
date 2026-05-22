import { writeFile } from "node:fs/promises";
import { runScenario } from "../../core/engine.js";
import { renderHtmlReport } from "../../reporters/html.js";
import { renderJsonReport } from "../../reporters/json.js";
import { renderTerminalReport } from "../../reporters/terminal.js";
import type { RunReport } from "../../types/index.js";

interface RunOptions {
  policy?: string;
  format?: string;
  out?: string;
}

export async function runCommand(
  scenario: string,
  options: RunOptions = {}
): Promise<void> {
  const report = await runScenario(scenario, { policyPath: options.policy });
  const output = renderReport(report, options.format ?? "terminal");

  if (options.out) {
    await writeFile(options.out, `${output}\n`);
  } else {
    console.log(output);
  }

  process.exitCode = report.status === "passed" ? 0 : 1;
}

function renderReport(report: RunReport, format: string): string {
  if (format === "json") {
    return renderJsonReport(report);
  }

  if (format === "html") {
    return renderHtmlReport(report);
  }

  if (format !== "terminal") {
    throw new Error(`Unsupported report format: ${format}`);
  }

  return renderTerminalReport(report);
}
