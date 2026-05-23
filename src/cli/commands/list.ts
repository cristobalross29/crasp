import Table from "cli-table3";
import { listRunReports } from "../../storage/index.js";

export async function listCommand(): Promise<void> {
  const reports = await listRunReports();

  if (reports.length === 0) {
    console.log("No Crasp runs found.");
    return;
  }

  const table = new Table({
    head: ["Run", "Scenario", "Status", "Started", "Violations"]
  });

  reports.forEach((report) => {
    table.push([
      report.runId,
      report.scenarioName,
      report.status,
      report.startedAt,
      report.summary.violations
    ]);
  });

  console.log(table.toString());
}
