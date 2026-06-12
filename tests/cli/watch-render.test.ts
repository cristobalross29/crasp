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
