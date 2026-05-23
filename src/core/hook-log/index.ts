import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HookLogEntry, HookLogOutcome, HookLogTier } from "../../types/index.js";
import type { HookTool } from "../scanner/sensitive-paths.js";

export { HookLogEntry };

const AGENTFENCE_DIR = ".agentfence";
const LOG_FILE = "events.ndjson";
const MAX_AGE_DAYS = 90;
const PRUNE_THRESHOLD = 0.1;

export function hookLogPath(root?: string): string {
  const base = root ?? process.cwd();
  return path.join(base, AGENTFENCE_DIR, LOG_FILE);
}

export async function appendHookLogEntry(
  filePath: string,
  tool: HookTool,
  outcome: HookLogOutcome,
  tier?: HookLogTier,
  ruleId?: string,
  root?: string
): Promise<void> {
  try {
    const logPath = hookLogPath(root);
    await mkdir(path.dirname(logPath), { recursive: true });

    const entry: HookLogEntry = {
      ts: new Date().toISOString(),
      tool,
      filePath,
      outcome,
      ...(tier !== undefined ? { tier } : {}),
      ...(ruleId !== undefined ? { ruleId } : {}),
    };

    await appendFile(logPath, JSON.stringify(entry) + "\n");
  } catch {
    // Swallow all errors — logging must never throw
  }
}

export interface ReadHookLogOptions {
  prune?: boolean;
  since?: Date;
}

export async function readHookLog(
  root?: string,
  opts?: ReadHookLogOptions
): Promise<HookLogEntry[]> {
  const logPath = hookLogPath(root);

  let raw: string;
  try {
    raw = await readFile(logPath, "utf8");
  } catch {
    // File doesn't exist or can't be read
    return [];
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS);

  const lines = raw.split("\n");
  const kept: HookLogEntry[] = [];
  let prunedCount = 0;
  let totalParsed = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: HookLogEntry;
    try {
      entry = JSON.parse(trimmed) as HookLogEntry;
    } catch {
      // Skip corrupt lines silently
      continue;
    }

    totalParsed++;

    // Drop entries older than 90 days
    if (new Date(entry.ts) < cutoffDate) {
      prunedCount++;
      continue;
    }

    kept.push(entry);
  }

  // Prune rewrite: if prune option is set and >10% of total entries were pruned
  if (opts?.prune && totalParsed > 0 && prunedCount / totalParsed > PRUNE_THRESHOLD) {
    const newContents = kept.map((e) => JSON.stringify(e)).join("\n") + "\n";
    void writeFile(logPath, newContents).catch(() => {});
  }

  // Apply since filter
  let result = kept;
  if (opts?.since) {
    const sinceTime = opts.since.getTime();
    result = kept.filter((e) => new Date(e.ts).getTime() >= sinceTime);
  }

  // Sort oldest-first
  result.sort((a, b) => a.ts.localeCompare(b.ts));

  return result;
}
