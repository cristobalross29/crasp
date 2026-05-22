import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunReport } from "../types/index.js";

export function defaultStorageDir(): string {
  return path.resolve(".agentfence", "runs");
}

export async function saveRunReport(
  report: RunReport,
  storageDir = defaultStorageDir()
): Promise<string> {
  const runDir = path.join(storageDir, report.runId);
  const reportPath = path.join(runDir, "report.json");

  await mkdir(runDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  return reportPath;
}

export async function loadRunReport(
  runId: string,
  storageDir = defaultStorageDir()
): Promise<RunReport> {
  const reportPath = path.join(storageDir, runId, "report.json");
  const raw = await readFile(reportPath, "utf8");

  return JSON.parse(raw) as RunReport;
}

export async function listRunReports(
  storageDir = defaultStorageDir()
): Promise<RunReport[]> {
  try {
    const entries = await readdir(storageDir, { withFileTypes: true });
    const reports = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => loadRunReport(entry.name, storageDir))
    );

    return reports.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
