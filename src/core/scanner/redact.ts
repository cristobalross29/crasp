import type { FileScanMatch, FileScanResult } from "../../types/index.js";

export function redactSensitiveScanResults(
  results: FileScanResult[]
): FileScanResult[] {
  return results.map((result) => ({
    ...result,
    matches: result.matches.map(redactSensitiveMatch),
  }));
}

function redactSensitiveMatch(match: FileScanMatch): FileScanMatch {
  if (match.ruleId !== "token-leakage") return match;
  const redacted = redactSecret(match.match);
  return {
    ...match,
    match: redacted,
    context: match.context.replace(match.match, redacted),
  };
}

function redactSecret(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const assignment = normalized.match(/^([^=:]+[=:]\s*["']?)(.+?)(["']?)$/);
  if (assignment) {
    return `${assignment[1]}${redactValue(assignment[2])}${assignment[3]}`;
  }
  return redactValue(normalized);
}

function redactValue(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
}
