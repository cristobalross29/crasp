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
// An ISO datetime (has a T time component) that lacks an explicit timezone
// designator (Z or ±HH:MM). Date-only strings are already UTC under Date.parse.
const ISO_NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;

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
    const d = new Date(now.getTime() - n * UNIT_MS[rel[2]]);
    // A huge duration (e.g. 999999999d) overflows the Date range → NaN.
    if (Number.isNaN(d.getTime())) return INVALID_SINCE;
    return d;
  }

  if (ISO.test(s)) {
    // Offset-less ISO datetime (e.g. 2026-06-12T10:00) is parsed as UTC, not
    // host-local, so the --since window is consistent across hosts and matches
    // the UTC semantics used by the renderer (fmtTime / todayCount).
    const normalized = ISO_NAIVE_DATETIME.test(s) ? `${s}Z` : s;
    const ms = Date.parse(normalized);
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

// Glyphs we emit that occupy two terminal columns (the icon set + any wide
// chars). ℹ and ⚠ are the same Unicode emoji-symbol class and render wide in
// most terminals; treat them as 2 for safety. ✓ renders narrow (width 1).
const WIDE = new Set(["🛡", "⚪", "ℹ", "⚠"]);

const RESET = "\x1b[0m";

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

/**
 * Truncate to `cols` visible columns, never cutting through an ANSI escape.
 * If the clip falls after an opening SGR but before its reset, the reset is
 * lost and color bleeds into following lines / the shell prompt — so we
 * re-balance by appending a reset when the clipped line opens color and does
 * not already end with one (E3).
 */
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
  return balanceSgr(out);
}

/** Append a reset if the line opens an SGR sequence but doesn't already end with one. */
function balanceSgr(line: string): string {
  if (!line.includes("\x1b[")) return line;
  if (line.endsWith("\x1b[0m") || line.endsWith("\x1b[39m") || line.endsWith("\x1b[49m")) return line;
  return line + RESET;
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

// Two blank spacer lines bracket the body (one above, one below) on terminals
// tall enough to afford them (E7).
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

// Visible width of the icon column. Icons are 1 or 2 cells wide; pad every icon
// to a fixed 2-cell slot so all later columns share the same origin regardless
// of glyph width (E3 — no ragged columns).
const ICON_SLOT = 2;
const PATH_COL = 20; // visible width of the path/command column

/** Pad an icon to ICON_SLOT visible cells (a wide glyph gets no extra space). */
function iconSlot(ic: string): string {
  return ic + " ".repeat(Math.max(0, ICON_SLOT - visibleWidth(ic)));
}

/** Clip a plain (no-ANSI) field to a fixed visible width, then pad it out. */
function fixedField(field: string, width: number): string {
  const clipped = visibleWidth(field) > width ? clip(field, width) : field;
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function eventLine(e: HookLogEntry): string {
  // A JSON-valid line may omit filePath (or set it null) — coerce to a string.
  const filePath = typeof e.filePath === "string" ? e.filePath : "(unknown)";
  const time = fmtTime(new Date(e.ts));
  const ic = iconSlot(safeIcon(e.outcome));
  const tool = String(e.tool).padEnd(5);
  const raw = e.tool === "Bash" ? commandDisplay(filePath) : fileDisplay(filePath);
  const col = fixedField(raw, PATH_COL);
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

  // Whether to emit the optional chrome — the spacer blanks and the two rules —
  // is decided up front so the TOTAL frame never exceeds `rows` on a tiny
  // terminal (E7). Body capacity then absorbs whatever budget remains.
  // Minimum frame is just the header line + status line (2 lines).
  const headerRule = rows >= 4;             // 1 line
  const footerRule = rows >= 5;             // 1 line
  const tallies = rows >= 3;                // 1 line (drop before the spacers)
  const spacers = rows >= 8 ? SPACER_LINES : 0; // 0, or 2 blanks bracketing body

  const chrome =
    1 +                       // header line
    (headerRule ? 1 : 0) +
    spacers +
    (footerRule ? 1 : 0) +
    (tallies ? 1 : 0) +
    1;                        // status line
  const capacity = Math.max(0, rows - chrome);

  const lines: string[] = [];
  lines.push(headerLine);
  if (headerRule) lines.push(rule(cols));

  if (spacers) lines.push("");
  if (entries.length === 0) {
    const body = [
      "   No activity yet — Crasp will show hook decisions here",
      "   as Claude Code works.",
    ].slice(0, capacity);
    lines.push(...body);
  } else {
    const shown = capacity > 0 ? entries.slice(-capacity) : [];
    for (const e of shown) lines.push(eventLine(e));
  }
  if (spacers) lines.push("");

  if (footerRule) lines.push(rule(cols));
  if (tallies) lines.push(footerTallies(entries));
  lines.push(status);

  // Color contract (E1): strip ANSI entirely when color:false; otherwise keep it.
  // Truncation is always computed on visible width via clip(), so a colored line
  // is never cut mid-escape-sequence.
  const finished = lines.map((l) => {
    const colored = color ? l : l.replace(ANSI, "");
    return clip(colored, cols);
  });

  // Final guard: never emit more lines than the terminal has rows (E7).
  return finished.slice(0, Math.max(1, rows)).join("\n");
}
