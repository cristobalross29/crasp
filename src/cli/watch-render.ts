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
