import path from "node:path";
import { stat } from "node:fs/promises";
import {
  scanDirectory,
  scanFiles,
  summarizeScanResults,
} from "../../core/scanner/index.js";
import { redactSensitiveScanResults } from "../../core/scanner/redact.js";
import { computeAction } from "../action.js";
import type {
  FileScanMatch,
  FileScanResult,
  Policy,
  ScanSummary,
} from "../../types/index.js";

interface ScanArgs {
  path: string;
  recursive?: boolean;
}

interface ScanResult {
  action: "allow" | "warn" | "block";
  summary: ScanSummary;
  results: FileScanResult[];
  scanErrors: Array<{ filePath: string; error: string }>;
}

export async function handleScan(
  args: ScanArgs,
  policy: Policy
): Promise<ScanResult> {
  const resolvedPath = path.resolve(args.path);
  const fileStat = await stat(resolvedPath);

  const rawResults = fileStat.isDirectory()
    ? await scanDirectory(resolvedPath, policy, {
        recursive: args.recursive ?? true,
      })
    : await scanFiles([resolvedPath], policy);

  const results = redactSensitiveScanResults(rawResults);
  const summary = summarizeScanResults(results);
  const allMatches: FileScanMatch[] = results.flatMap((r) => r.matches);

  const scanErrors = results
    .filter((r) => !r.scanned)
    .map((r) => ({ filePath: r.filePath, error: r.error ?? "Could not scan" }));

  const action =
    allMatches.length > 0
      ? computeAction(allMatches)
      : scanErrors.length > 0
        ? "warn"
        : "allow";

  return { action, summary, results, scanErrors };
}
