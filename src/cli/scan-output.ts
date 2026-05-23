import Table from "cli-table3";
import { summarizeScanResults } from "../core/scanner/index.js";
import { redactSensitiveScanResults } from "../core/scanner/redact.js";
import type { FileScanResult } from "../types/index.js";

export { redactSensitiveScanResults };

const MAX_TERMINAL_ROWS = 50;
const MAX_FILE_CELL_LENGTH = 96;
const MAX_MATCH_CELL_LENGTH = 120;

interface TerminalScanOutputOptions {
  emptyMessage: (scannedFiles: number) => string;
  foundMessage: (totalMatches: number, matchedFiles: number) => string;
}

export function printTerminalScanResults(
  results: FileScanResult[],
  options: TerminalScanOutputOptions
): void {
  const summary = summarizeScanResults(results);
  const skippedFiles = results.filter((result) => !result.scanned).length;

  if (summary.totalMatches === 0) {
    console.log(options.emptyMessage(summary.scannedFiles));
    if (skippedFiles > 0) {
      console.log(`Skipped ${skippedFiles} files that could not be scanned.`);
    }
    return;
  }

  const table = new Table({
    head: ["File", "Rule", "Severity", "Line", "Match"],
    wordWrap: true
  });
  let renderedRows = 0;

  for (const result of results) {
    for (const match of result.matches) {
      if (renderedRows >= MAX_TERMINAL_ROWS) {
        break;
      }

      table.push([
        truncate(result.filePath, MAX_FILE_CELL_LENGTH),
        match.ruleId,
        match.severity,
        `${match.line}:${match.column}`,
        formatMatch(match.ruleId, match.match)
      ]);
      renderedRows += 1;
    }

    if (renderedRows >= MAX_TERMINAL_ROWS) {
      break;
    }
  }

  console.log(table.toString());
  console.log(options.foundMessage(summary.totalMatches, summary.matchedFiles));

  if (summary.totalMatches > renderedRows) {
    console.log(
      `Showing first ${renderedRows} matches. Use --format json for complete results.`
    );
  }

  if (skippedFiles > 0) {
    console.log(`Skipped ${skippedFiles} files that could not be scanned.`);
  }
}

function formatMatch(ruleId: string, value: string): string {
  if (ruleId === "token-leakage") {
    const normalized = value.replace(/\s+/g, " ").trim();
    const assignment = normalized.match(/^([^=:]+[=:]\s*["']?)(.+?)(["']?)$/);
    if (assignment) {
      return `${assignment[1]}${redactValue(assignment[2])}${assignment[3]}`;
    }
    return redactValue(normalized);
  }
  return truncate(value, MAX_MATCH_CELL_LENGTH);
}

function redactValue(value: string): string {
  if (value.length <= 8) {
    return "[REDACTED]";
  }
  return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}
