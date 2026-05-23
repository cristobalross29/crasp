import type { FileScanMatch } from "../types/index.js";

const BLOCK_SEVERITIES = new Set(["high", "critical"]);

export function computeAction(
  matches: FileScanMatch[]
): "allow" | "warn" | "block" {
  if (matches.some((m) => BLOCK_SEVERITIES.has(m.severity))) return "block";
  if (matches.length > 0) return "warn";
  return "allow";
}
