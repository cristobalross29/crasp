import { stat } from "node:fs/promises";
import path from "node:path";
import {
  printTerminalScanResults,
  redactSensitiveScanResults
} from "../scan-output.js";
import { loadConfig } from "../../core/config/index.js";
import { loadPolicy, policyExists } from "../../core/policy/loader.js";
import { mergeWithBuiltin } from "../../core/patterns/index.js";
import {
  scanDirectory,
  scanFiles,
  summarizeScanResults
} from "../../core/scanner/index.js";
import type { FileScanResult, Policy, Severity } from "../../types/index.js";

interface ScanOptions {
  policy?: string;
  format?: string;
  severity?: Severity;
}

export async function scanCommand(
  scanPath = process.cwd(),
  options: ScanOptions = {}
): Promise<void> {
  const policy = await loadMergedPolicy(options.policy);
  const results = await scanPathTarget(scanPath, policy);
  const format = options.format ?? "terminal";
  const threshold = options.severity ?? "low";

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          summary: summarizeScanResults(results),
          results: redactSensitiveScanResults(results)
        },
        null,
        2
      )
    );
  } else if (format === "terminal") {
    printTerminalScanResults(results, {
      emptyMessage: (scannedFiles) =>
        `No matches found. Scanned ${scannedFiles} files.`,
      foundMessage: (totalMatches, matchedFiles) =>
        `Found ${totalMatches} matches in ${matchedFiles} files.`
    });
  } else {
    throw new Error(`Unsupported scan format: ${format}`);
  }

  process.exitCode = hasSeverityAtOrAbove(results, threshold) ? 1 : 0;
}

async function scanPathTarget(
  targetPath: string,
  policy: Policy
): Promise<FileScanResult[]> {
  const resolvedPath = path.resolve(targetPath);
  const fileStat = await stat(resolvedPath);

  if (fileStat.isDirectory()) {
    return scanDirectory(resolvedPath, policy);
  }

  if (fileStat.isFile()) {
    return scanFiles([resolvedPath], policy);
  }

  return [];
}

async function loadMergedPolicy(policyPath?: string): Promise<Policy> {
  const config = await loadConfig();
  const resolvedPolicyPath = policyPath
    ? path.resolve(policyPath)
    : config?.policyPath
      ? path.resolve(config.policyPath)
      : path.resolve("crasp.policy.yml");
  const userPolicy = (await policyExists(resolvedPolicyPath))
    ? await loadPolicy(resolvedPolicyPath)
    : undefined;

  return mergeWithBuiltin(userPolicy);
}

function hasSeverityAtOrAbove(
  results: FileScanResult[],
  threshold: Severity
): boolean {
  const severityRank: Record<Severity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  };

  return results.some((result) =>
    result.matches.some(
      (match) => severityRank[match.severity] >= severityRank[threshold]
    )
  );
}
