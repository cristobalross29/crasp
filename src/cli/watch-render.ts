import type { HookLogEntry } from "../types/index.js";

export interface Tallies {
  clean: number;
  ask: number;
  advisory: number;
  blocked: number;
  exception: number;
}

export function tally(entries: HookLogEntry[]): Tallies {
  const t: Tallies = { clean: 0, ask: 0, advisory: 0, blocked: 0, exception: 0 };
  for (const e of entries) {
    switch (e.outcome) {
      case "clean":     t.clean++; break;
      case "ask":       t.ask++; break;
      case "advisory":  t.advisory++; break;
      case "denied":    t.blocked++; break;   // log vocabulary is "denied", UI label is "blocked"
      case "exception": t.exception++; break;
      // unknown outcomes are ignored, never throw (E8)
    }
  }
  return t;
}

/** Sentinel returned by parseSince for a present-but-malformed spec. */
export const INVALID_SINCE = Symbol("invalid-since");

const RELATIVE = /^(\d+)(s|m|h|d)$/;
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
// Strict ISO-8601: YYYY-MM-DD, optional T time, optional fractional seconds, optional Z/offset.
const ISO =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Returns:
 *  - undefined        when the spec is absent (no filter)
 *  - a Date           when the spec is a valid positive relative duration or strict ISO
 *  - INVALID_SINCE    when the spec is present but malformed / non-positive
 */
export function parseSince(spec: string | undefined, now: Date): Date | undefined | typeof INVALID_SINCE {
  if (spec === undefined || spec.trim() === "") return undefined;
  const s = spec.trim();

  const rel = RELATIVE.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    if (n <= 0) return INVALID_SINCE; // non-positive window is a mistake (E6)
    return new Date(now.getTime() - n * UNIT_MS[rel[2]]);
  }

  if (ISO.test(s)) {
    const ms = Date.parse(s);
    if (!Number.isNaN(ms)) return new Date(ms);
  }

  return INVALID_SINCE;
}

import { icon, outcomeLabel, fileDisplay, commandDisplay } from "./commands/hook-log.js";

export interface DashboardOptions {
  rows: number;
  cols: number;
  watchPath: string;
  now: Date;       // injected clock — renderer NEVER calls Date.now()
  color: boolean;  // true: keep chalk codes; false: strip ANSI (E1)
}

const ANSI = /\x1b\[[0-9;]*m/g;

// Glyphs we emit that occupy two terminal columns (the icon set + any wide chars).
const WIDE = new Set(["🛡", "⚪", "ℹ"]); // ℹ renders wide in most terminals; treat as 2 for safety

export function fmtTime(date: Date, withSeconds = false): string {
  if (Number.isNaN(date.getTime())) return "--:--"; // bad/empty ts survives readHookLog (E8)
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  if (!withSeconds) return `${hh}:${mm}`;
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function visibleWidth(str: string): number {
  const plain = str.replace(ANSI, "");
  let w = 0;
  for (const ch of plain) w += WIDE.has(ch) ? 2 : 1;
  return w;
}

/** Truncate to `cols` visible columns, never cutting through an ANSI escape. */
export function clip(line: string, cols: number): string {
  if (visibleWidth(line) <= cols) return line;
  let w = 0;
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\x1b") {
      const m = /^\x1b\[[0-9;]*m/.exec(line.slice(i));
      if (m) { out += m[0]; i += m[0].length; continue; } // keep full escape, no width
    }
    const cp = [...line.slice(i)][0]; // next code point
    const cw = WIDE.has(cp) ? 2 : 1;
    if (w + cw > cols) break;
    out += cp;
    w += cw;
    i += cp.length;
  }
  return out;
}

const NEUTRAL_ICON = "·";

function safeIcon(outcome: HookLogEntry["outcome"]): string {
  const known = ["clean", "advisory", "ask", "denied", "exception"];
  return known.includes(outcome) ? icon(outcome) : NEUTRAL_ICON; // E8
}

function safeLabel(entry: HookLogEntry): string {
  const known = ["clean", "advisory", "ask", "denied", "exception"];
  return known.includes(entry.outcome) ? outcomeLabel(entry) : entry.outcome; // E8
}

// ── chrome line counts — MUST match the lines actually pushed below (E7) ───────
// Header block: title line + rule line.
const HEADER_LINES = 2;
// Footer block: rule line + tallies line + status line.
const FOOTER_LINES = 3;
// Two blank spacer lines bracket the body (one above, one below).
const SPACER_LINES = 2;

function rule(cols: number): string {
  return "─".repeat(Math.max(1, Math.min(cols, 78)));
}

function todayCount(entries: HookLogEntry[], now: Date): number {
  // UTC day window so the count is deterministic across hosts (matches fmtTime).
  const day = now.toISOString().slice(0, 10);
  return entries.filter((e) => {
    const d = new Date(e.ts);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
  }).length;
}

function eventLine(e: HookLogEntry): string {
  const time = fmtTime(new Date(e.ts));
  const ic = safeIcon(e.outcome);
  const tool = String(e.tool).padEnd(5);
  const col = e.tool === "Bash" ? commandDisplay(e.filePath) : fileDisplay(e.filePath);
  return `${time}  ${ic}  ${tool}  ${col}  ${safeLabel(e)}`;
}

function footerTallies(entries: HookLogEntry[]): string {
  const t = tally(entries);
  // Legend icons sourced from icon() — single source of truth (E11).
  return (
    `${icon("clean")} ${t.clean} clean   ` +
    `${icon("ask")} ${t.ask} ask   ` +
    `${icon("advisory")} ${t.advisory} advisory   ` +
    `${icon("denied")} ${t.blocked} blocked   ` +
    `${icon("exception")} ${t.exception} exception`
  );
}

export function renderDashboard(entries: HookLogEntry[], opts: DashboardOptions): string {
  const { rows, cols, watchPath, now, color } = opts;

  const title = `Crasp · watching ${watchPath}`;
  const count = `Today: ${todayCount(entries, now)} events`;
  const headerLine =
    title.length + count.length + 2 <= cols
      ? title + " ".repeat(cols - title.length - count.length) + count
      : title;

  const status = `watching · Ctrl-C to exit                      updated ${fmtTime(now, true)}`;

  const lines: string[] = [];
  lines.push(headerLine);
  lines.push(rule(cols));

  // Body capacity: rows minus the header/footer chrome and the two blank spacers.
  // Floors at 1 so a tiny terminal still shows the newest event (E7).
  const capacity = Math.max(1, rows - HEADER_LINES - FOOTER_LINES - SPACER_LINES);

  if (entries.length === 0) {
    // Empty-state body, clamped to `capacity` lines so it never overruns (E7).
    const body = [
      "",
      "   No activity yet — Crasp will show hook decisions here",
      "   as Claude Code works.",
      "",
    ].slice(0, Math.max(1, capacity));
    lines.push(...body);
  } else {
    const shown = entries.slice(-capacity);
    lines.push("");
    for (const e of shown) lines.push(eventLine(e));
    lines.push("");
  }

  lines.push(rule(cols));
  lines.push(footerTallies(entries));
  lines.push(status);

  // Color contract (E1): strip ANSI entirely when color:false; otherwise keep it.
  // Truncation is always computed on visible width via clip(), so a colored line
  // is never cut mid-escape-sequence.
  const finished = lines.map((l) => {
    const colored = color ? l : l.replace(ANSI, "");
    return clip(colored, cols);
  });

  return finished.join("\n");
}
