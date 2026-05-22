import { writeFile } from "node:fs/promises";
import { renderHtmlReport } from "../../reporters/html.js";
import { renderJsonReport } from "../../reporters/json.js";
import { renderTerminalReport } from "../../reporters/terminal.js";
import { loadRunReport } from "../../storage/index.js";
import type { RunReport } from "../../types/index.js";

interface ReportOptions {
  format?: string;
  out?: string;
}

export async function reportCommand(
  runId: string,
  options: ReportOptions = {}
): Promise<void> {
  const report = await loadRunReport(runId);
  const output = renderReport(report, options.format ?? "terminal");

  if (options.out) {
    await writeFile(options.out, `${output}\n`);
    return;
  }

  console.log(output);
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
