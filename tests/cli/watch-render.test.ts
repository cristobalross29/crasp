import { describe, it, expect } from "vitest";
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
  });
  it("clip truncates on visible width without cutting an escape sequence", () => {
    const colored = "\x1b[31m" + "x".repeat(50) + "\x1b[0m";
    const out = clip(colored, 10);
    expect(visibleWidth(out)).toBeLessThanOrEqual(10);
    // no dangling/half escape: stripping then re-measuring stays consistent
    expect(out.replace(ESC, "").length).toBeLessThanOrEqual(10);
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
    const EXPECTED = [
      "Crasp · watching .crasp/events.ndjson                    Today: 2 events",
      "────────────────────────────────────────────────────────────────────────",
      "",
      "14:02  ✓  Write  src/index.ts          clean",
      "14:04  🛡  Write  src/secrets.ts        BLOCKED [token-leakage]",
      "",
      "────────────────────────────────────────────────────────────────────────",
      "✓ 1 clean   ⚠ 0 ask   ℹ 0 advisory   🛡 1 blocked   ⚪ 0 exception",
      "watching · Ctrl-C to exit                      updated 14:05:11",
    ].join("\n");
    expect(out).toBe(EXPECTED);
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
