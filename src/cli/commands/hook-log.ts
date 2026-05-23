import chalk from "chalk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hookLogPath, readHookLog } from "../../core/hook-log/index.js";
import type { HookLogEntry } from "../../types/index.js";

export interface HookLogOptions {
  days?: string;
  summary?: boolean;
  json?: boolean;
  prune?: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toLocalDateString(ts: string): string {
  return new Date(ts).toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function icon(outcome: HookLogEntry["outcome"]): string {
  switch (outcome) {
    case "clean":     return "✓";
    case "advisory":  return "ℹ";
    case "ask":       return "⚠";
    case "denied":    return "🛡";
    case "exception": return "⚪";
  }
}

function outcomeLabel(entry: HookLogEntry): string {
  switch (entry.outcome) {
    case "denied":
      return chalk.red("BLOCKED" + (entry.ruleId ? ` [${entry.ruleId}]` : ""));
    case "ask":
      return chalk.yellow("ask dialog shown");
    case "advisory":
      return chalk.blue("warned Claude about secrets");
    case "exception":
      return chalk.dim("bypassed (policy exception)");
    case "clean":
    default:
      return chalk.dim("clean");
  }
}

function fileDisplay(filePath: string): string {
  const segments = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const display =
    segments.length >= 2
      ? segments.slice(-2).join("/")
      : segments.join("/") || filePath;
  return display.padEnd(20);
}

function dayLabel(dateStr: string): string {
  const today = new Date().toLocaleDateString("en-CA");
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA");
  if (dateStr === today) return `Today  (${dateStr})`;
  if (dateStr === yesterday) return `Yesterday  (${dateStr})`;
  return dateStr;
}

function buildSummary(entries: HookLogEntry[]): {
  total: number;
  blocked: number;
  asks: number;
  advisories: number;
  clean: number;
} {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const window = entries.filter((e) => new Date(e.ts) >= thirtyDaysAgo);
  return {
    total:       window.length,
    blocked:     window.filter((e) => e.outcome === "denied").length,
    asks:        window.filter((e) => e.outcome === "ask").length,
    advisories:  window.filter((e) => e.outcome === "advisory").length,
    clean:       window.filter((e) => e.outcome === "clean" || e.outcome === "exception").length,
  };
}

function printSummaryBlock(stats: ReturnType<typeof buildSummary>): void {
  console.log("\nLast 30 days");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(
    `  ${stats.total} total  ·  ${stats.blocked} blocked  ·  ${stats.asks} asks  ·  ${stats.advisories} advisories  ·  ${stats.clean} clean`
  );
}

// ── main command ──────────────────────────────────────────────────────────────

export async function hookLogCommand(options: HookLogOptions = {}): Promise<void> {
  const root = process.cwd();

  // ── --prune ────────────────────────────────────────────────────────────────
  if (options.prune) {
    // Count total valid lines in the raw file before pruning
    const logFile = hookLogPath(root);
    let beforeCount = 0;
    try {
      const raw = await readFile(logFile, "utf8");
      beforeCount = raw
        .split("\n")
        .filter((l) => {
          const t = l.trim();
          if (!t) return false;
          try { JSON.parse(t); return true; } catch { return false; }
        }).length;
    } catch {
      // File doesn't exist yet
    }

    await readHookLog(root, { prune: true });
    // Wait briefly for the async background rewrite to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    const after = await readHookLog(root);
    const pruned = beforeCount - after.length;
    if (pruned > 0) {
      console.log(`Pruned ${pruned} entries older than 90 days.`);
    } else {
      console.log("Nothing to prune.");
    }
    return;
  }

  // ── --json ─────────────────────────────────────────────────────────────────
  if (options.json) {
    const entries = await readHookLog(root, { prune: true });
    for (const entry of entries) {
      process.stdout.write(JSON.stringify(entry) + "\n");
    }
    return;
  }

  // ── load all entries (already sorted oldest→newest by readHookLog) ─────────
  const allEntries = await readHookLog(root);

  // ── empty log ─────────────────────────────────────────────────────────────
  if (allEntries.length === 0) {
    console.log(
      "No activity recorded yet. AgentFence hooks will log here automatically."
    );
    return;
  }

  // ── --summary only ────────────────────────────────────────────────────────
  if (options.summary) {
    const stats = buildSummary(allEntries);
    printSummaryBlock(stats);
    return;
  }

  // ── default display: grouped by day, last N days (default 2) ─────────────
  const nDays = Math.max(1, parseInt(options.days ?? "2", 10) || 2);
  const cutoff = new Date(Date.now() - nDays * 24 * 60 * 60 * 1000);

  // Filter to entries within the display window
  const displayEntries = allEntries.filter((e) => new Date(e.ts) >= cutoff);

  // Group by local date string, newest date first
  const byDay = new Map<string, HookLogEntry[]>();
  for (const entry of displayEntries) {
    const day = toLocalDateString(entry.ts);
    const group = byDay.get(day) ?? [];
    group.push(entry);
    byDay.set(day, group);
  }

  // Sort days newest-first
  const sortedDays = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  for (const day of sortedDays) {
    const dayEntries = byDay.get(day)!;
    // Within the day, entries go chronologically (oldest first)
    dayEntries.sort((a, b) => a.ts.localeCompare(b.ts));

    console.log(chalk.bold(`\n${dayLabel(day)}`));

    for (let i = 0; i < dayEntries.length; i++) {
      const entry = dayEntries[i];

      // Gap separator: >30 min between consecutive entries
      if (i > 0) {
        const prev = dayEntries[i - 1];
        const gapMs = new Date(entry.ts).getTime() - new Date(prev.ts).getTime();
        if (gapMs > 30 * 60 * 1000) {
          console.log(chalk.dim("  · · ·"));
        }
      }

      const time     = formatTime(entry.ts);
      const ic       = icon(entry.outcome);
      const tool     = entry.tool.padEnd(5);
      const filePart = fileDisplay(entry.filePath);
      const label    = outcomeLabel(entry);

      console.log(`  ${time}  ${ic}  ${tool}  ${filePart}  ${label}`);
    }
  }

  // ── 30-day summary footer ─────────────────────────────────────────────────
  const stats = buildSummary(allEntries);
  printSummaryBlock(stats);
}
