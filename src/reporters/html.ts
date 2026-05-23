import type { RunReport } from "../types/index.js";

export function renderHtmlReport(report: RunReport): string {
  const rows = report.violations
    .map(
      (violation) => `<tr><td>${escapeHtml(violation.severity)}</td><td>${escapeHtml(
        violation.ruleId ?? violation.expectationId ?? "n/a"
      )}</td><td>${escapeHtml(violation.message)}</td></tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Crasp Report ${escapeHtml(report.runId)}</title>
  <style>
    body { color: #17202a; font-family: Arial, sans-serif; margin: 2rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #d7dbdd; padding: 0.6rem; text-align: left; }
    .passed { color: #0e7c3a; }
    .failed { color: #b42318; }
  </style>
</head>
<body>
  <h1>Crasp Report</h1>
  <p><strong>Run:</strong> ${escapeHtml(report.runId)}</p>
  <p><strong>Scenario:</strong> ${escapeHtml(report.scenarioName)}</p>
  <p><strong>Status:</strong> <span class="${report.status}">${report.status}</span></p>
  <h2>Summary</h2>
  <ul>
    <li>Steps: ${report.summary.steps}</li>
    <li>Expectations: ${report.summary.passedExpectations}/${report.summary.expectations} passed</li>
    <li>Violations: ${report.summary.violations}</li>
  </ul>
  <h2>Violations</h2>
  <table>
    <thead><tr><th>Severity</th><th>Rule</th><th>Message</th></tr></thead>
    <tbody>${rows || "<tr><td colspan=\"3\">None</td></tr>"}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
