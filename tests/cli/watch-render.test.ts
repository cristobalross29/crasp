import { describe, it, expect } from "vitest";
import chalk from "chalk";
import {
  icon,
  outcomeLabel,
  fileDisplay,
  commandDisplay,
} from "../../src/cli/commands/hook-log.js";

describe("hook-log helpers are exported", () => {
  it("icon maps outcomes to glyphs", () => {
    expect(icon("clean")).toBe("✓");
    expect(icon("ask")).toBe("⚠");
    expect(icon("denied")).toBe("🛡");
  });

  it("outcomeLabel describes a denied entry as BLOCKED", () => {
    const label = outcomeLabel({ ts: "", tool: "Write", filePath: "x", outcome: "denied", ruleId: "r" });
    expect(label).toContain("BLOCKED");
  });

  it("commandDisplay collapses whitespace", () => {
    expect(commandDisplay("rm -rf build").trim()).toBe("rm -rf build");
  });

  it("fileDisplay keeps the last two path segments", () => {
    expect(fileDisplay("/a/b/c/src/index.ts").trim()).toBe("src/index.ts");
  });
});

import { tally, parseSince, INVALID_SINCE } from "../../src/cli/watch-render.js";
import type { HookLogEntry } from "../../src/types/index.js";

function entry(o: Partial<HookLogEntry> = {}): HookLogEntry {
  return { ts: "2026-06-12T14:00:00.000Z", tool: "Write", filePath: "src/x.ts", outcome: "clean", ...o };
}

describe("tally", () => {
  it("counts each outcome (denied → blocked)", () => {
    const t = tally([
      entry({ outcome: "clean" }),
      entry({ outcome: "clean" }),
      entry({ outcome: "ask" }),
      entry({ outcome: "advisory" }),
      entry({ outcome: "denied" }),
      entry({ outcome: "exception" }),
    ]);
    expect(t).toEqual({ clean: 2, ask: 1, advisory: 1, blocked: 1, exception: 1 });
  });

  it("returns all-zero for an empty list", () => {
    expect(tally([])).toEqual({ clean: 0, ask: 0, advisory: 0, blocked: 0, exception: 0 });
  });

  it("ignores unknown outcomes without throwing (E8)", () => {
    // outcome cast through unknown — corrupt-but-JSON-valid entries survive readHookLog
    const corrupt = { ts: "2026-06-12T14:00:00.000Z", tool: "Write", filePath: "x", outcome: "warn" } as unknown as HookLogEntry;
    expect(() => tally([corrupt])).not.toThrow();
    expect(tally([corrupt])).toEqual({ clean: 0, ask: 0, advisory: 0, blocked: 0, exception: 0 });
  });
});

describe("parseSince (strict grammar, E6)", () => {
  const now = new Date("2026-06-12T14:00:00.000Z");

  it("parses positive relative durations", () => {
    expect((parseSince("30m", now) as Date).toISOString()).toBe("2026-06-12T13:30:00.000Z");
    expect((parseSince("2h", now) as Date).toISOString()).toBe("2026-06-12T12:00:00.000Z");
    expect((parseSince("1d", now) as Date).toISOString()).toBe("2026-06-11T14:00:00.000Z");
    expect((parseSince("45s", now) as Date).toISOString()).toBe("2026-06-12T13:59:15.000Z");
  });

  it("parses a strict ISO-8601 timestamp", () => {
    expect((parseSince("2026-06-12T10:00:00.000Z", now) as Date).toISOString()).toBe("2026-06-12T10:00:00.000Z");
  });

  it("returns undefined for an absent spec", () => {
    expect(parseSince(undefined, now)).toBeUndefined();
    expect(parseSince("", now)).toBeUndefined();
  });

  it("returns INVALID_SINCE for malformed input (no silent show-all)", () => {
    expect(parseSince("garbage", now)).toBe(INVALID_SINCE);
    expect(parseSince("30min", now)).toBe(INVALID_SINCE);
    expect(parseSince("March 2026", now)).toBe(INVALID_SINCE); // loose Date.parse would accept this
    expect(parseSince("3", now)).toBe(INVALID_SINCE);
  });

  it("treats a non-positive relative window as invalid (E6)", () => {
    expect(parseSince("0m", now)).toBe(INVALID_SINCE);
    expect(parseSince("0s", now)).toBe(INVALID_SINCE);
  });

  it("treats a relative duration that overflows the Date range as invalid (E6)", () => {
    // 999999999d underflows past the minimum representable Date → NaN, not a Date.
    expect(parseSince("999999999d", now)).toBe(INVALID_SINCE);
    expect(parseSince("9999999999999d", now)).toBe(INVALID_SINCE);
  });

  it("treats offset-less ISO datetimes as UTC, independent of host TZ", () => {
    // Same instant regardless of process.env.TZ: offset-less ISO is read as UTC.
    const naive = parseSince("2026-06-12T10:00", now) as Date;
    expect(naive.toISOString()).toBe("2026-06-12T10:00:00.000Z");
    const withSeconds = parseSince("2026-06-12T10:00:00", now) as Date;
    expect(withSeconds.toISOString()).toBe("2026-06-12T10:00:00.000Z");
    // A bare date stays UTC midnight (Date.parse spec behaviour, unchanged).
    const dateOnly = parseSince("2026-06-12", now) as Date;
    expect(dateOnly.toISOString()).toBe("2026-06-12T00:00:00.000Z");
  });
});

import {
  renderDashboard,
  fmtTime,
  visibleWidth,
  clip,
  type DashboardOptions,
} from "../../src/cli/watch-render.js";
import { icon } from "../../src/cli/commands/hook-log.js";

const NOW = new Date("2026-06-12T14:05:11.000Z");

function opts(over: Partial<DashboardOptions> = {}): DashboardOptions {
  return { rows: 24, cols: 80, watchPath: ".crasp/events.ndjson", now: NOW, color: false, ...over };
}

const ESC = /\x1b\[[0-9;]*m/g;

describe("fmtTime (UTC, E2)", () => {
  it("formats HH:MM in UTC", () => {
    expect(fmtTime(new Date("2026-06-12T14:02:00.000Z"))).toBe("14:02");
  });
  it("formats HH:MM:SS with seconds", () => {
    expect(fmtTime(new Date("2026-06-12T14:05:11.000Z"), true)).toBe("14:05:11");
  });
  it("renders --:-- for an invalid date (E8)", () => {
    expect(fmtTime(new Date("oops"))).toBe("--:--");
  });
});

describe("visibleWidth + clip (E3)", () => {
  it("ignores ANSI escapes", () => {
    expect(visibleWidth("\x1b[31mabc\x1b[0m")).toBe(3);
  });
  it("counts wide emoji icons as width 2", () => {
    expect(visibleWidth("🛡")).toBe(2);
    expect(visibleWidth("⚪")).toBe(2);
    expect(visibleWidth("ℹ")).toBe(2);
    expect(visibleWidth("⚠")).toBe(2); // same emoji-symbol class as ℹ (E3)
  });
  it("clip truncates on visible width without cutting an escape sequence", () => {
    const colored = "\x1b[31m" + "x".repeat(50) + "\x1b[0m";
    const out = clip(colored, 10);
    expect(visibleWidth(out)).toBeLessThanOrEqual(10);
    // no dangling/half escape: stripping then re-measuring stays consistent
    expect(out.replace(ESC, "").length).toBeLessThanOrEqual(10);
  });
  it("clip re-balances a dropped SGR reset so color cannot bleed (E3)", () => {
    // Opening SGR, then content, then reset — clip cuts before the reset.
    const colored = "\x1b[31m" + "x".repeat(50) + "\x1b[0m";
    const out = clip(colored, 10);
    const opens = (out.match(/\x1b\[[0-9;]+m/g) ?? []).filter((c) => c !== "\x1b[0m").length;
    const resets = (out.match(/\x1b\[0m/g) ?? []).length;
    expect(opens).toBe(resets);          // SGR balanced
    expect(out.endsWith("\x1b[0m")).toBe(true); // ends with a reset
  });

  it("balanceSgr does NOT double-reset a line whose truncation keeps the trailing \\x1b[0m", () => {
    // Construct a line where clipping at exactly the right width preserves the trailing reset.
    // "abc\x1b[31m" + 10 chars of content + "\x1b[0m" — if we clip at 13 we keep the SGR but
    // not the content; if the reset lands within the clip window it must not be doubled.
    // Simplest: content short enough to fit entirely, then the trailing \x1b[0m is preserved by clip.
    // clip() returns early (no truncation) when visibleWidth <= cols, so the balanceSgr path
    // for a "truncated but already-reset" line is only reachable when the reset escape itself
    // is included in the output by the escape-passthrough loop. Build exactly that:
    // content = 5 visible chars + \x1b[0m, clip at 5 → clip loop includes the \x1b[0m (zero width),
    // then balanceSgr must not add another.
    const line = "\x1b[31m" + "abcde" + "\x1b[0m" + "extra_visible_chars_that_push_past_5";
    const out = clip(line, 5); // clips after "abcde", but \x1b[0m has zero visible width so it's kept
    expect(out.endsWith("\x1b[0m")).toBe(true);
    expect(out.endsWith("\x1b[0m\x1b[0m")).toBe(false); // no double-reset
  });

  it("balanceSgr does NOT add reset for line ending with \\x1b[39m (fg reset)", () => {
    // \x1b[39m is a valid foreground-color reset; appending \x1b[0m would be redundant.
    const withFgReset = "\x1b[31m" + "x".repeat(50) + "\x1b[39m";
    const out = clip(withFgReset, 10);
    // After truncation, clip loop passes escapes through; if \x1b[39m lands in window it's kept.
    // If not, balanceSgr appends \x1b[0m (not \x1b[39m) — that's acceptable.
    // What we guard against: a line that clip returns ending in \x1b[39m must NOT get \x1b[0m added.
    // Build a line where \x1b[39m is inside the clip window:
    const shortWithFgReset = "\x1b[31m" + "ab" + "\x1b[39m" + "cde_overflow";
    const out2 = clip(shortWithFgReset, 5); // 5 visible chars: "ab" + "cde" with \x1b[39m inside
    // \x1b[39m has zero width so it passes through; the result ends with \x1b[39m (or \x1b[0m from balance)
    // The important invariant: no bleed (has a trailing reset of some kind)
    expect(out2.endsWith("\x1b[0m") || out2.endsWith("\x1b[39m") || out2.endsWith("\x1b[49m")).toBe(true);
    expect(out2.endsWith("\x1b[39m\x1b[0m")).toBe(false); // \x1b[39m already resets fg — no extra needed
  });

  it("balanceSgr: multiple openers truncated mid-sequence end with exactly one reset", () => {
    // Multiple opening SGRs, content, no closing reset — clip must append exactly one reset.
    const multiOpen = "\x1b[31m\x1b[1m" + "y".repeat(50);
    const out = clip(multiOpen, 10);
    expect(out.endsWith("\x1b[0m")).toBe(true);
    const resets = (out.match(/\x1b\[0m/g) ?? []).length;
    expect(resets).toBe(1); // exactly one trailing reset, not two or more
  });
});

describe("renderDashboard", () => {
  it("renders header, events, and footer tallies (color:false ⇒ plain text)", () => {
    const out = renderDashboard(
      [
        entry({ ts: "2026-06-12T14:02:00.000Z", tool: "Write", filePath: "src/index.ts", outcome: "clean" }),
        entry({ ts: "2026-06-12T14:03:00.000Z", tool: "Bash", filePath: "rm -rf build", outcome: "ask", ruleId: "bash-rm-rf" }),
        entry({ ts: "2026-06-12T14:04:00.000Z", tool: "Write", filePath: "src/secrets.ts", outcome: "denied", ruleId: "token-leakage" }),
      ],
      opts(),
    );
    expect(out).toContain("watching");
    expect(out).toContain(".crasp/events.ndjson");
    expect(out).toContain("Write");
    expect(out).toContain("rm -rf build");
    expect(out).toContain("BLOCKED");
    expect(out).toContain("1 clean");
    expect(out).toContain("1 ask");
    expect(out).toContain("1 blocked");
    // color:false ⇒ NO ANSI codes anywhere (E1)
    expect(ESC.test(out)).toBe(false);
  });

  it("EXACT FRAME for a fixed input (determinism, E2)", () => {
    const out = renderDashboard(
      [
        entry({ ts: "2026-06-12T14:02:00.000Z", tool: "Write", filePath: "src/index.ts", outcome: "clean" }),
        entry({ ts: "2026-06-12T14:04:00.000Z", tool: "Write", filePath: "src/secrets.ts", outcome: "denied", ruleId: "token-leakage" }),
      ],
      opts({ rows: 10, cols: 72 }),
    );
    // Pin the whole frame. Frozen to the renderer's REAL output (UTC, plain text).
    // The icon column is padded to a fixed 2-cell slot so the Write/path/label
    // columns line up flush across a clean (✓, width 1) and a denied (🛡, width 2)
    // row — note the narrow ✓ carries an extra trailing space.
    const EXPECTED = [
      "Crasp · watching .crasp/events.ndjson                    Today: 2 events",
      "────────────────────────────────────────────────────────────────────────",
      "",
      "14:02  ✓   Write  src/index.ts          clean",
      "14:04  🛡  Write  src/secrets.ts        BLOCKED [token-leakage]",
      "",
      "────────────────────────────────────────────────────────────────────────",
      "✓ 1 clean   ⚠ 0 ask   ℹ 0 advisory   🛡 1 blocked   ⚪ 0 exception",
      "watching · Ctrl-C to exit                      updated 14:05:11",
    ].join("\n");
    expect(out).toBe(EXPECTED);

    // Columns line up: the "Write" tool and the path start at the same offset
    // on both rows despite the differing icon glyph widths.
    const rowClean = out.split("\n").find((l) => l.startsWith("14:02"))!;
    const rowDenied = out.split("\n").find((l) => l.startsWith("14:04"))!;
    expect(rowClean.indexOf("Write")).toBe(rowDenied.indexOf("Write"));
    expect(rowClean.indexOf("src/")).toBe(rowDenied.indexOf("src/"));
  });

  it("shows the empty-state placeholder when there are no entries", () => {
    const out = renderDashboard([], opts());
    expect(out).toContain("No activity yet");
    expect(out).toContain("0 clean");
  });

  it("clamps the empty-state body to a tiny row budget (E7)", () => {
    const out = renderDashboard([], opts({ rows: 6 }));
    expect(out.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("keeps only the newest events that fit; populated frame ≤ rows (E7)", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      entry({ ts: `2026-06-12T10:${String(i % 60).padStart(2, "0")}:00.000Z`, filePath: `src/f${i}.ts` }),
    );
    const out = renderDashboard(many, opts({ rows: 12 }));
    expect(out.split("\n").length).toBeLessThanOrEqual(12);
    expect(out).toContain("src/f199.ts"); // newest present
    expect(out).not.toContain("src/f0.ts"); // oldest scrolled off
  });

  it("never exceeds `rows` on tiny terminals, empty AND populated (E7)", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      entry({ ts: `2026-06-12T10:${String(i % 60).padStart(2, "0")}:00.000Z`, filePath: `src/f${i}.ts` }),
    );
    for (const rows of [5, 1]) {
      const empty = renderDashboard([], opts({ rows }));
      expect(empty.split("\n").length).toBeLessThanOrEqual(rows);
      const populated = renderDashboard(many, opts({ rows }));
      expect(populated.split("\n").length).toBeLessThanOrEqual(rows);
    }
  });

  it("slice(-0) regression: capacity=0 yields zero event rows, not all entries (E7)", () => {
    // With rows=5 and enough chrome, capacity may be 0 — previously slice(-0)===slice(0)
    // returned ALL entries which then got truncated by the final slice(0,rows),
    // dropping the footer/status line entirely.
    const many = Array.from({ length: 20 }, (_, i) =>
      entry({ ts: `2026-06-12T10:${String(i % 60).padStart(2, "0")}:00.000Z`, filePath: `src/f${i}.ts` }),
    );
    // rows=5: chrome = header(1) + headerRule(1) + footerRule(1) + tallies(1) + status(1) = 5
    // capacity = 5 - 5 = 0 → must produce zero event rows, not 20
    const out = renderDashboard(many, opts({ rows: 5 }));
    const lines = out.split("\n");
    // (a) frame line count ≤ rows
    expect(lines.length).toBeLessThanOrEqual(5);
    // (b) no event rows leaked — none of the entry filenames should appear
    for (const line of lines) {
      expect(line).not.toMatch(/src\/f\d+\.ts/);
    }
    // (c) frame is internally sensible — has header and status
    expect(lines[0]).toContain("Crasp");
    expect(lines[lines.length - 1]).toContain("watching");
  });

  it("slice(-0) regression: rows=1 with entries still respects the row budget (E7)", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      entry({ ts: `2026-06-12T10:${String(i % 60).padStart(2, "0")}:00.000Z`, filePath: `src/g${i}.ts` }),
    );
    const out = renderDashboard(many, opts({ rows: 1 }));
    expect(out.split("\n").length).toBeLessThanOrEqual(1);
    // no event rows leaked on a 1-row terminal
    expect(out).not.toMatch(/src\/g\d+\.ts/);
  });

  it("coerces a missing/null filePath to a placeholder, never crashes (MEDIUM)", () => {
    const noPath = { ts: "2026-06-12T14:00:00.000Z", tool: "Write", outcome: "clean" } as unknown as HookLogEntry;
    const nullPath = { ts: "2026-06-12T14:00:00.000Z", tool: "Write", filePath: null, outcome: "clean" } as unknown as HookLogEntry;
    let out = "";
    expect(() => { out = renderDashboard([noPath, nullPath], opts()); }).not.toThrow();
    expect(out).toContain("(unknown)");
  });

  it("color:true keeps ANSI and every event/footer line is SGR-balanced (E3)", () => {
    // chalk auto-disables off a TTY (level 0); force colors so the colored label
    // path actually exercises the clip()/reset-balance logic.
    const prevLevel = chalk.level;
    chalk.level = 1;
    try {
      // cols=48 cuts the colored label (BLOCKED [..]) mid-sequence so the
      // chalk close code is dropped and clip() must re-balance with a reset.
      const out = renderDashboard(
        [entry({ tool: "Write", filePath: "src/secrets.ts", outcome: "denied", ruleId: "token-leakage" })],
        opts({ color: true, cols: 48 }),
      );
      // ANSI is present (color:true)
      expect(/\x1b\[[0-9;]*m/.test(out)).toBe(true);
      const eventRow = out.split("\n").find((l) => l.startsWith("14:00"))!;
      expect(eventRow).toContain("\x1b["); // it really is colored
      expect(eventRow.endsWith("\x1b[0m")).toBe(true); // reset restored after the cut
      // every line that opens an SGR ends with a reset (no bleed)
      for (const line of out.split("\n")) {
        if (line.includes("\x1b[")) expect(line.endsWith("\x1b[0m") || line.endsWith("\x1b[39m") || line.endsWith("\x1b[22m")).toBe(true);
      }
    } finally {
      chalk.level = prevLevel;
    }
  });

  it("emoji-bearing rows at small cols do not overflow visible width (E3)", () => {
    const out = renderDashboard(
      [
        entry({ tool: "Write", filePath: "src/secrets.ts", outcome: "denied", ruleId: "token-leakage" }),
        entry({ tool: "Bash", filePath: "rm -rf node_modules", outcome: "exception" }),
      ],
      opts({ cols: 30 }),
    );
    for (const line of out.split("\n")) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(30);
    }
  });

  it("renders unknown outcome/tool with a neutral icon, never crashes (E8)", () => {
    const corrupt = { ts: "oops", tool: "Frobnicate", filePath: "x", outcome: "warn" } as unknown as HookLogEntry;
    let out = "";
    expect(() => { out = renderDashboard([corrupt], opts()); }).not.toThrow();
    expect(out).toContain("·");      // neutral icon
    expect(out).toContain("--:--");  // invalid ts (E8)
  });

  it("footer legend icons equal icon() outputs (single source of truth, E11)", () => {
    const out = renderDashboard([], opts());
    const footer = out.split("\n").find((l) => l.includes("clean"))!;
    expect(footer).toContain(icon("clean"));
    expect(footer).toContain(icon("ask"));
    expect(footer).toContain(icon("advisory"));
    expect(footer).toContain(icon("denied"));
    expect(footer).toContain(icon("exception"));
  });
});
