import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { printTerminalScanResults } from "../scan-output.js";
import { loadConfig } from "../../core/config/index.js";
import { loadPolicy, policyExists } from "../../core/policy/loader.js";
import { mergeWithBuiltin } from "../../core/patterns/index.js";
import { scanDirectory, scanFiles } from "../../core/scanner/index.js";
import type { FileScanResult, Policy, Severity } from "../../types/index.js";

const execFileAsync = promisify(execFile);

interface CheckOptions {
  staged?: boolean;
}

export async function checkCommand(
  paths: string[] = [],
  options: CheckOptions = {}
): Promise<void> {
  const policy = await loadMergedPolicy();
  const filePaths = options.staged ? await stagedFiles() : paths;
  const results =
    options.staged || filePaths.length > 0
      ? await scanPathList(filePaths, policy)
      : await scanDirectory(process.cwd(), policy);

  printTerminalScanResults(results, {
    emptyMessage: (scannedFiles) =>
      `AgentFence check passed. Scanned ${scannedFiles} files.`,
    foundMessage: (totalMatches, matchedFiles) =>
      `AgentFence check found ${totalMatches} matches in ${matchedFiles} files.`
  });

  process.exitCode = hasSeverityAtOrAbove(results, "high") ? 1 : 0;
}

async function stagedFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync("git", [
    "diff",
    "--cached",
    "--name-only"
  ]);

  return stdout
    .split(/\r?\n/)
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

async function scanPathList(
  pathsToScan: string[],
  policy: Policy
): Promise<FileScanResult[]> {
  const results: FileScanResult[] = [];

  for (const pathToScan of pathsToScan) {
    const resolvedPath = path.resolve(pathToScan);
    let fileStat: Awaited<ReturnType<typeof stat>>;

    try {
      fileStat = await stat(resolvedPath);
    } catch (error) {
      results.push({
        filePath: resolvedPath,
        matches: [],
        scanned: false,
        error: error instanceof Error ? error.message : "Unable to stat path."
      });
      continue;
    }

    if (fileStat.isDirectory()) {
      results.push(...(await scanDirectory(resolvedPath, policy)));
      continue;
    }

    if (fileStat.isFile()) {
      results.push(...(await scanFiles([resolvedPath], policy)));
    }
  }

  return results;
}

async function loadMergedPolicy(): Promise<Policy> {
  const config = await loadConfig();
  const configuredPolicyPath = config?.policyPath
    ? path.resolve(config.policyPath)
    : path.resolve("agentfence.policy.yml");
  const userPolicy =
    configuredPolicyPath && (await policyExists(configuredPolicyPath))
      ? await loadPolicy(configuredPolicyPath)
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
