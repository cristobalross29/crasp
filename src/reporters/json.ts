import type { RunReport } from "../types/index.js";

export function renderJsonReport(report: RunReport): string {
  return JSON.stringify(report, null, 2);
}
