# Live Dashboard (`crasp watch`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `crasp watch` — a dependency-free, live-updating terminal dashboard that tails `.crasp/events.ndjson` and shows recent hook decisions plus running tallies (clean / ask / advisory / blocked / exception), updating in real time as Claude Code works. A `--once`/`--since` mode renders one snapshot (the session summary); non-TTY invocations degrade gracefully to a single snapshot.

**Architecture:** Split a **pure renderer** (`src/cli/watch-render.ts` → `renderDashboard(entries, opts): string`, plus pure `tally()`, `parseSince()`, `fmtTime()`, `visibleWidth()`, `clip()`) from an **injectable poll tick** (`src/cli/watch-poll.ts`) and a **thin IO shell** (`src/cli/commands/watch.ts`). The renderer holds all layout/logic and is unit-tested with exact-string assertions against fixtures and an injected clock. The tick is unit-tested with injected `stat`/clock/`readHookLog`. The shell reads entries via the existing `readHookLog()`, validates `--since`/`--interval`, and — in TTY mode — runs the tick on a `setInterval` inside the alternate screen buffer with crash-safe synchronous teardown. In non-TTY mode (pipes, CI) it prints one frame and exits. The renderer reuses four `hook-log.ts` presentational helpers (promoted to exports) and **strips/keeps** chalk codes itself per `opts.color`.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), Vitest, Commander CLI, pnpm. **Zero new dependencies** — ANSI escapes + `node:fs`/`node:fs/promises` only.

**Design ref:** `docs/superpowers/specs/2026-06-12-f4-dashboard-design.md`

---

## Decisions baked into this plan (review map)

| ID | Decision | Where |
|----|----------|-------|
| E1 | `opts.color` real: strip ANSI when `false`; width on stripped copy when `true` | Task 3 + Task 4 |
| E2 | Renderer owns UTC `fmtTime`; Vitest TZ setup; exact-frame test | Task 2 (setup) + Task 4 |
| E3 | `visibleWidth` (wide emoji = 2) + `clip` on visible width; emoji-row overflow tests | Task 4 |
| E4 | Injectable, unit-tested poll tick: read-gate on signature, cache, debounce | Task 6 |
| E5 | Crash-safe synchronous teardown (`fs.writeSync`), idempotent, all signals | Task 7 |
| E6 | Strict `--since` grammar; invalid → stderr + non-zero exit | Task 3 + Task 8 |
| E7 | Correct `HEADER_LINES`/`FOOTER_LINES`; clamp empty-state to row budget | Task 4 |
| E8 | Renderer robust on bad data (`--:--`, neutral icon, tally ignores unknown) | Task 4 |
| E9 | `--interval` explicit parse: warn + fallback (floor 50ms) | Task 7 + Task 8 |
| E10 | `displayPath` via `path.relative(root, absPath)` | Task 7 |
| E11 | Footer legend icons sourced from `icon()` (single source of truth) | Task 4 |
| E12 | One commit per task; distinct files; only shared file is `src/cli/index.ts` | all |

---

## File Structure

- `src/cli/commands/hook-log.ts` — modify (additive) — `export` four presentational helpers (`icon`, `outcomeLabel`, `fileDisplay`, `commandDisplay`); bodies untouched, no output change. **`formatTime` is NOT exported/reused.**
- `tests/setup.ts` — **new** — sets `process.env.TZ = "UTC"`.
- `vitest.config.ts` — modify (additive) — `setupFiles: ["tests/setup.ts"]`.
- `src/cli/watch-render.ts` — **new** — pure renderer + `tally` + `parseSince` + `fmtTime` + `visibleWidth` + `clip`.
- `src/cli/watch-poll.ts` — **new** — injectable poll tick (`createPoller`).
- `src/cli/commands/watch.ts` — **new** — thin IO shell `watchCommand()`.
- `src/cli/index.ts` — modify (additive) — register the `watch` command. **Only file shared with the parallel F2 branch.**
- `tests/cli/watch-render.test.ts` — **new** — unit tests of renderer / `tally` / `parseSince`.
- `tests/cli/watch-poll.test.ts` — **new** — unit tests of the injectable tick.
- `tests/cli/watch.test.ts` — **new** — CLI integration tests (spawn `dist/index.js`).
- `README.md`, `CHANGELOG.md` — modify — document `crasp watch`.

**Commands:** `pnpm test <pattern>` runs targeted Vitest. CLI integration tests spawn `dist/index.js`, so run `pnpm build` before them.

**Commit trailer (every commit):**
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

**Cross-branch note (E12):** `src/cli/index.ts` (Task 9) is the one file F2 and F4 both edit. F4's edit is one import + one `program.command("watch")` block appended **last** (immediately before `program.parse();`), on different lines and a different command name than F2 — a trivial both-sides-add merge. Every other task touches its own distinct files.

---

## Task 1: Export hook-log presentational helpers

Make four `hook-log.ts` formatting helpers importable so the dashboard renders events identically. Strictly additive — add `export` to four existing functions, **do not touch their bodies**. The renderer (Task 4) owns color-stripping and UTC time; `formatTime` is intentionally **not** exported.

**Files:**
- Modify: `src/cli/commands/hook-log.ts`
- Test: `tests/cli/watch-render.test.ts` (**new** — first assertion drives the exports)

- [ ] **Step 1: Write the failing test**

Create `tests/cli/watch-render.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test watch-render`
Expected: FAIL — `icon`, `outcomeLabel`, `fileDisplay`, `commandDisplay` are not exported from `hook-log.js` (import resolves to `undefined`; calling throws / `toBe` fails).

- [ ] **Step 3: Add `export` to the four helpers**

In `src/cli/commands/hook-log.ts`, add the `export` keyword to these four existing function declarations (do **not** change their bodies, and do **not** export `formatTime`):

```ts
export function icon(outcome: HookLogEntry["outcome"]): string {
```
```ts
export function outcomeLabel(entry: HookLogEntry): string {
```
```ts
export function fileDisplay(filePath: string): string {
```
```ts
export function commandDisplay(command: string): string {
```

- [ ] **Step 4: Run test + verify hook-log output is unchanged**

Run: `pnpm test watch-render && pnpm test hook-log && pnpm typecheck`
Expected: PASS — new helper tests pass, the existing `hook-log` integration suite still passes (output byte-identical), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/hook-log.ts tests/cli/watch-render.test.ts
git commit -m "refactor: export hook-log presentational helpers for reuse

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Vitest UTC setup file (determinism scaffolding) — E2

A one-time scaffolding task so every later time assertion is timezone-independent. Sets `process.env.TZ = "UTC"` before any test module loads, wired via Vitest `setupFiles`.

**Files:**
- Create: `tests/setup.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Create the setup file**

Create `tests/setup.ts`:

```ts
// Force UTC so any Date formatting in tests is host-timezone-independent.
// Belt-and-suspenders alongside the renderer's UTC fmtTime (E2).
process.env.TZ = "UTC";
```

- [ ] **Step 2: Wire it into Vitest config**

Edit `vitest.config.ts` to add `setupFiles` (additive — keep the existing `include`):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
```

- [ ] **Step 3: Verify the whole suite still passes**

Run: `pnpm test`
Expected: PASS — the existing suite is unaffected (this only pins TZ). No new test file is needed for this scaffolding; Task 4's exact-frame test proves it works end-to-end.

- [ ] **Step 4: Commit**

```bash
git add tests/setup.ts vitest.config.ts
git commit -m "test: force UTC via Vitest setup for deterministic time assertions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Pure `tally` + strict `parseSince` — E6, E8

Two small pure helpers the renderer and shell depend on. `tally` tolerates unknown outcomes (E8). `parseSince` enforces a strict grammar and signals *invalid* distinctly from *absent* (E6).

**Files:**
- Create: `src/cli/watch-render.ts`
- Test: `tests/cli/watch-render.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/cli/watch-render.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test watch-render`
Expected: FAIL — `src/cli/watch-render.js` does not exist (cannot resolve `tally`, `parseSince`, `INVALID_SINCE`).

- [ ] **Step 3: Create the module with the two helpers**

Create `src/cli/watch-render.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test watch-render && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/watch-render.ts tests/cli/watch-render.test.ts
git commit -m "feat: add tally + strict since-parser for the watch dashboard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Pure `renderDashboard()` + width/time/color machinery — E1, E2, E3, E7, E8, E11

The heart of the feature: a deterministic frame builder. It owns UTC time (E2), visible-width truncation with wide-glyph awareness (E3), the real `opts.color` contract (E1), correct row budgeting (E7), robustness on bad data (E8), and a footer legend sourced from `icon()` (E11).

**Files:**
- Modify: `src/cli/watch-render.ts`
- Test: `tests/cli/watch-render.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/cli/watch-render.test.ts`:

```ts
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
    // Pin the whole frame. Regenerate once during implementation, then freeze.
    // The exact expected string is produced by the implementation in Step 3 and
    // copied here verbatim; this test then guards against any drift.
    const EXPECTED = [
      "Crasp · watching .crasp/events.ndjson             Today: 2 events",
      "──────────────────────────────────────────────────────────────────────",
      "",
      "14:02  ✓  Write  src/index.ts          clean",
      "14:04  🛡  Write  src/secrets.ts         BLOCKED [token-leakage]",
      "",
      "──────────────────────────────────────────────────────────────────────",
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
```

> **Note on the EXACT FRAME test:** the `EXPECTED` block above is illustrative.
> During Step 3 the implementer runs the renderer once with the same input, copies
> the produced frame verbatim into `EXPECTED`, and freezes it. From then on the
> test guards byte-for-byte determinism (padding, spacing, UTC time, plain text).
> If column math differs slightly from the sketch, freeze the **actual** output —
> the point is determinism, not matching this exact sketch.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test watch-render`
Expected: FAIL — `renderDashboard`, `fmtTime`, `visibleWidth`, `clip`, `DashboardOptions` not exported.

- [ ] **Step 3: Implement the renderer + machinery**

Append to `src/cli/watch-render.ts`:

```ts
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
```

> **Row-budget audit (E7):** with `entries.length > 0` the frame emits
> `HEADER_LINES (2) + 1 blank + up to capacity events + 1 blank + FOOTER_LINES (3)`
> `= 2 + 1 + capacity + 1 + 3`. With `capacity = rows - 2 - 3 - 2 = rows - 7`, the
> total is `rows`. For the empty state the body is `min(4, capacity)` lines, so the
> total is `≤ rows`. The implementer MUST confirm the small-`rows` tests pass; if
> the arithmetic is off by one, adjust `SPACER_LINES`/`capacity`, not the test
> bound.

- [ ] **Step 4: Run test; freeze the exact frame; verify pass**

Run: `pnpm test watch-render`
First run may fail ONLY on the EXACT FRAME test if the column math differs from the sketch. If so: copy the **actual** rendered frame from the test diff into `EXPECTED` verbatim, then re-run. All other assertions must pass on the first implementation.

Run: `pnpm test watch-render && pnpm typecheck`
Expected: PASS (all assertions, including the now-frozen exact frame).

- [ ] **Step 5: Commit**

```bash
git add src/cli/watch-render.ts tests/cli/watch-render.test.ts
git commit -m "feat: add pure renderDashboard with UTC time, visible-width clip, color contract

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: (reserved — folded into Task 4)

Layout, color, width, time, and robustness all live in the single pure renderer module (Task 4) and are committed together. No separate task.

---

## Task 6: Injectable, unit-tested poll tick — E4 (the #1 risk)

Extract the live-loop body into a testable `createPoller` with injected `stat`, clock, `readHookLog`, and a `render` sink. Behavior: read **only** when the `(size, mtime)` signature changes; cache entries; a clock-only tick re-renders the cache with **no** re-read; a trailing debounce coalesces a burst. The `setInterval` wrapper (Task 7) is a thin shell that just calls `poller.tick()`.

**Files:**
- Create: `src/cli/watch-poll.ts`
- Test: `tests/cli/watch-poll.test.ts` (**new**)

- [ ] **Step 1: Write the failing test**

Create `tests/cli/watch-poll.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createPoller } from "../../src/cli/watch-poll.js";
import type { HookLogEntry } from "../../src/types/index.js";

function entry(o: Partial<HookLogEntry> = {}): HookLogEntry {
  return { ts: "2026-06-12T14:00:00.000Z", tool: "Write", filePath: "src/x.ts", outcome: "clean", ...o };
}

function harness(opts: { debounceMs?: number } = {}) {
  let statValue = { size: 0, mtimeMs: 0 };
  const stat = vi.fn(async () => ({ size: statValue.size, mtimeMs: statValue.mtimeMs }));
  const entriesValue: HookLogEntry[] = [];
  const readHookLog = vi.fn(async () => [...entriesValue]);
  const render = vi.fn((_entries: HookLogEntry[], _now: Date) => {});
  let nowMs = 1_000;
  const clock = () => new Date(nowMs);

  const poller = createPoller({
    stat,
    readHookLog,
    render,
    clock,
    debounceMs: opts.debounceMs ?? 0,
  });

  return {
    poller,
    stat,
    readHookLog,
    render,
    setStat: (size: number, mtimeMs: number) => { statValue = { size, mtimeMs }; },
    setEntries: (e: HookLogEntry[]) => { entriesValue.length = 0; entriesValue.push(...e); },
    advance: (ms: number) => { nowMs += ms; },
  };
}

describe("createPoller (E4)", () => {
  it("first tick reads + renders", async () => {
    const h = harness();
    h.setStat(10, 100);
    h.setEntries([entry()]);
    await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(1);
    expect(h.render).toHaveBeenCalledTimes(1);
  });

  it("unchanged signature → no re-read, still re-renders cached entries (clock refresh)", async () => {
    const h = harness();
    h.setStat(10, 100);
    h.setEntries([entry()]);
    await h.poller.tick(); // read #1
    h.advance(250);
    await h.poller.tick(); // same sig
    expect(h.readHookLog).toHaveBeenCalledTimes(1); // NO second read
    expect(h.render).toHaveBeenCalledTimes(2);      // but re-rendered (clock advanced)
  });

  it("changed signature → re-reads", async () => {
    const h = harness();
    h.setStat(10, 100);
    h.setEntries([entry()]);
    await h.poller.tick();
    h.setStat(20, 200);                 // file grew
    h.setEntries([entry(), entry()]);
    await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(2);
    expect(h.render).toHaveBeenCalledTimes(2);
  });

  it("debounce coalesces a burst of changes into one re-read+render", async () => {
    const h = harness({ debounceMs: 100 });
    h.setStat(10, 100);
    await h.poller.tick();              // read #1, schedules nothing new (first read immediate)
    expect(h.readHookLog).toHaveBeenCalledTimes(1);

    // three rapid changes within the debounce window
    h.setStat(11, 101); await h.poller.tick();
    h.setStat(12, 102); await h.poller.tick();
    h.setStat(13, 103); await h.poller.tick();
    // within the window only ONE coalesced re-read fires
    await h.poller.flushDebounce();
    expect(h.readHookLog).toHaveBeenCalledTimes(2); // one coalesced read for the burst
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test watch-poll`
Expected: FAIL — `src/cli/watch-poll.js` does not exist.

- [ ] **Step 3: Implement the poller**

Create `src/cli/watch-poll.ts`:

```ts
import type { HookLogEntry } from "../types/index.js";

export interface PollerDeps {
  /** Returns the current size + mtime of the watched file. Throws if it vanished. */
  stat: () => Promise<{ size: number; mtimeMs: number }>;
  /** Reads + parses the log (the existing readHookLog, pre-bound to root/since). */
  readHookLog: () => Promise<HookLogEntry[]>;
  /** Side-effecting frame writer: (cachedEntries, now) → draw. */
  render: (entries: HookLogEntry[], now: Date) => void;
  /** Injected clock for deterministic time. */
  clock: () => Date;
  /** Trailing-debounce window in ms. 0 disables debouncing (each change reads). */
  debounceMs: number;
}

export interface Poller {
  /** One poll iteration: stat → read-gate → (debounced) read → render. */
  tick: () => Promise<void>;
  /** Force any pending debounced read to run now (test seam + teardown). */
  flushDebounce: () => Promise<void>;
}

export function createPoller(deps: PollerDeps): Poller {
  const { stat, readHookLog, render, clock, debounceMs } = deps;

  let lastSig: string | undefined;
  let cache: HookLogEntry[] = [];
  let pendingSince = 0; // timestamp (clock ms) of the first un-served change in the window

  async function read(): Promise<void> {
    cache = await readHookLog();
    render(cache, clock());
  }

  async function tick(): Promise<void> {
    let sig: string;
    try {
      const s = await stat();
      sig = `${s.size}:${s.mtimeMs}`;
    } catch {
      // File vanished (.crasp removed) — surface the empty state and reset.
      lastSig = undefined;
      cache = [];
      render(cache, clock());
      return;
    }

    const changed = sig !== lastSig;
    lastSig = sig;

    if (!changed) {
      // Clock-only refresh: re-render the cache cheaply, NO file read (E4).
      render(cache, clock());
      return;
    }

    if (debounceMs <= 0) {
      await read();
      return;
    }

    // Trailing debounce: remember the window start; coalesce until it elapses.
    const nowMs = clock().getTime();
    if (pendingSince === 0) pendingSince = nowMs;
    if (nowMs - pendingSince >= debounceMs) {
      pendingSince = 0;
      await read();
    } else {
      // still within the window — defer the read, but keep the status line live
      render(cache, clock());
    }
  }

  async function flushDebounce(): Promise<void> {
    if (pendingSince !== 0) {
      pendingSince = 0;
      await read();
    }
  }

  return { tick, flushDebounce };
}
```

> **Debounce semantics note for the implementer:** the test advances the injected
> clock between burst ticks via `flushDebounce()` to force the coalesced read. The
> exact coalescing shape (leading vs trailing) is flexible — the invariant the test
> pins is: a burst of N signature changes inside one window yields **one** extra
> `readHookLog` call, not N. If your implementation needs a small tweak to satisfy
> that invariant, adjust the implementation, not the invariant.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test watch-poll && pnpm typecheck`
Expected: PASS — first tick reads; unchanged sig → no re-read but re-renders; changed sig → re-reads; burst coalesces to one read.

- [ ] **Step 5: Commit**

```bash
git add src/cli/watch-poll.ts tests/cli/watch-poll.test.ts
git commit -m "feat: add injectable read-gated poll tick with debounce (unit-tested)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Thin IO shell `watchCommand()` — E5, E9, E10

The only impure code: validate options, read entries, render, write; in non-TTY/`--once` print one frame and exit; in TTY drive the Task-6 poller on a `setInterval` inside the alt-screen with **crash-safe synchronous teardown**.

**Files:**
- Create: `src/cli/commands/watch.ts`
- (Behaviour tested via Task 8's CLI integration once registered; the tick logic is already unit-tested in Task 6.)

- [ ] **Step 1: Write the module**

Create `src/cli/commands/watch.ts`:

```ts
import { writeSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { readHookLog, hookLogPath } from "../../core/hook-log/index.js";
import { renderDashboard, parseSince, INVALID_SINCE, type DashboardOptions } from "../watch-render.js";
import { createPoller } from "../watch-poll.js";

export interface WatchOptions {
  once?: boolean;
  since?: string;
  interval?: string;
}

const ENTER_ALT = "\x1b[?1049h";
const LEAVE_ALT = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const HOME_CLEAR = "\x1b[H\x1b[2J";

const DEFAULT_INTERVAL = 250;
const MIN_INTERVAL = 50;

function frameOpts(watchPath: string, color: boolean): DashboardOptions {
  return {
    rows: process.stdout.rows ?? 24,
    cols: process.stdout.columns ?? 80,
    watchPath,
    now: new Date(),
    color,
  };
}

/** Explicit interval parse: warn + fall back to default, floored at 50ms (E9). */
function resolveInterval(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_INTERVAL;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    process.stderr.write(`crasp watch: invalid --interval '${raw}', using ${DEFAULT_INTERVAL}ms\n`);
    return DEFAULT_INTERVAL;
  }
  return Math.max(MIN_INTERVAL, n);
}

export async function watchCommand(options: WatchOptions = {}): Promise<void> {
  const root = process.cwd();
  const absPath = hookLogPath(root);
  const displayPath = path.relative(root, absPath) || absPath; // E10

  // ── --since validation (E6): absent | Date | invalid ────────────────────────
  const since = parseSince(options.since, new Date());
  if (since === INVALID_SINCE) {
    process.stderr.write(`invalid --since: ${options.since}\n`);
    process.exitCode = 1;
    return;
  }
  const sinceDate = since; // Date | undefined

  const load = () => readHookLog(root, sinceDate ? { since: sinceDate } : undefined);

  // ── non-TTY or --once: single snapshot, then exit ───────────────────────────
  if (!process.stdout.isTTY || options.once) {
    if (!process.stdout.isTTY && !options.once) {
      process.stderr.write(
        "crasp watch: not a TTY — printing a one-shot snapshot (use --once to silence this).\n",
      );
    }
    const entries = await load();
    process.stdout.write(renderDashboard(entries, frameOpts(displayPath, false)) + "\n");
    return;
  }

  // ── TTY live loop ───────────────────────────────────────────────────────────
  const intervalMs = resolveInterval(options.interval);
  let timer: NodeJS.Timeout | undefined;
  let cleaned = false;

  // Crash-safe SYNCHRONOUS teardown (E5): writeSync so bytes flush during exit.
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    if (timer) clearInterval(timer);
    try {
      writeSync(1, SHOW_CURSOR + LEAVE_ALT);
    } catch {
      // nothing else we can do during teardown
    }
  };

  const render = (entries: ReturnType<typeof Array.prototype.slice> extends never ? never : Awaited<ReturnType<typeof load>>, now: Date): void => {
    const opts = frameOpts(displayPath, true);
    opts.now = now;
    process.stdout.write(HOME_CLEAR + renderDashboard(entries, opts));
  };

  const poller = createPoller({
    stat: () => stat(absPath).then((s) => ({ size: s.size, mtimeMs: s.mtimeMs })),
    readHookLog: load,
    render,
    clock: () => new Date(),
    debounceMs: intervalMs,
  });

  const draw = async (): Promise<void> => {
    try {
      await poller.tick();
    } catch (err) {
      cleanup();
      process.stderr.write(`crasp watch: ${(err as Error).message}\n`);
      process.exit(1);
    }
  };

  // Enter alt-screen + hide cursor, register teardown on EVERY exit path (E5).
  process.stdout.write(ENTER_ALT + HIDE_CURSOR);
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("uncaughtException", (err) => {
    cleanup();
    process.stderr.write(`crasp watch: ${err.message}\n`);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    cleanup();
    process.stderr.write(`crasp watch: ${String(reason)}\n`);
    process.exit(1);
  });

  await draw();
  timer = setInterval(() => { void draw(); }, intervalMs);
}
```

> **Implementer note on the `render` signature:** the `Awaited<ReturnType<typeof
> load>>` gymnastics above just types `entries` as `HookLogEntry[]`. Prefer
> importing `HookLogEntry` from `../../types/index.js` and typing it directly:
> `const render = (entries: HookLogEntry[], now: Date): void => { … }`. Use the
> simple import — the inline conditional type is only shown to make the data flow
> explicit and SHOULD be replaced with the plain import in the real code.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (The command isn't registered yet — Task 9 wires + integration-tests it. The poller's logic is already covered by Task 6.)

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/watch.ts
git commit -m "feat: add watch IO shell with crash-safe teardown + interval validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: CLI integration tests for the terminating paths — E6, E9

Prove the snapshot/`--once`/no-TTY/`--since` (valid + **invalid**) paths via spawned-process tests **before** registering the command would be circular, so the failing test in Step 2 fails on "unknown command"; Task 9 registers it. (We keep registration in its own task because `src/cli/index.ts` is the cross-branch shared file — see E12.)

> Ordering: write these tests here (Task 8), confirm they fail on the missing
> command, then register in Task 9 and confirm they pass. The test file is owned by
> Task 8; `src/cli/index.ts` is owned by Task 9.

**Files:**
- Test: `tests/cli/watch.test.ts` (**new**)

- [ ] **Step 1: Write the failing test**

Create `tests/cli/watch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("dist/index.js");

function entryLine(o: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    tool: "Write",
    filePath: "src/index.ts",
    outcome: "clean",
    ...o,
  });
}

async function seed(tmp: string, lines: string[]): Promise<void> {
  await mkdir(path.join(tmp, ".crasp"), { recursive: true });
  await writeFile(path.join(tmp, ".crasp", "events.ndjson"), lines.join("\n") + (lines.length ? "\n" : ""));
}

function run(tmp: string, args: string[]) {
  // spawnSync stdout is a pipe (not a TTY) → snapshot path; never the live loop.
  return spawnSync("node", [CLI, "watch", ...args], { cwd: tmp, encoding: "utf8", timeout: 10_000 });
}

describe("crasp watch", () => {
  it("--once renders one frame for seeded entries and exits 0", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-once-"));
    try {
      await seed(tmp, [
        entryLine({ outcome: "clean", filePath: "src/index.ts" }),
        entryLine({ tool: "Bash", filePath: "rm -rf build", outcome: "ask", ruleId: "bash-rm-rf" }),
        entryLine({ outcome: "denied", filePath: "src/secrets.ts", ruleId: "token-leakage" }),
      ]);
      const r = run(tmp, ["--once"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("watching");
      expect(r.stdout).toContain("rm -rf build");
      expect(r.stdout).toContain("BLOCKED");
      expect(r.stdout).toContain("1 ask");
      expect(r.stdout).toContain("1 blocked");
      // snapshot is plain text (color:false ⇒ no ANSI SGR codes)
      expect(/\x1b\[[0-9;]*m/.test(r.stdout)).toBe(false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("non-TTY (no --once) prints a snapshot + notice on stderr, exits 0", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-pipe-"));
    try {
      await seed(tmp, [entryLine({ outcome: "clean" })]);
      const r = run(tmp, []);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain("not a TTY");
      expect(r.stdout).toContain("watching");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("empty log → placeholder, exit 0", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-empty-"));
    try {
      await seed(tmp, []);
      const r = run(tmp, ["--once"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("No activity yet");
      expect(r.stdout).toContain("0 clean");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("missing .crasp/ → placeholder, exit 0 (no crash)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-missing-"));
    try {
      const r = run(tmp, ["--once"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("No activity yet");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("valid relative --since filters out older entries", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-since-"));
    try {
      const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
      await seed(tmp, [
        entryLine({ ts: old, outcome: "clean", filePath: "src/old.ts" }),
        entryLine({ outcome: "clean", filePath: "src/new.ts" }),
      ]);
      const r = run(tmp, ["--once", "--since", "1h"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("src/new.ts");
      expect(r.stdout).not.toContain("src/old.ts");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("valid ISO --since is accepted", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-iso-"));
    try {
      await seed(tmp, [entryLine({ outcome: "clean", filePath: "src/new.ts" })]);
      const r = run(tmp, ["--once", "--since", "2020-01-01T00:00:00.000Z"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("src/new.ts");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("invalid --since → stderr message + non-zero exit (E6)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-badsince-"));
    try {
      await seed(tmp, [entryLine({ outcome: "clean" })]);
      for (const bad of ["30min", "garbage", "0m"]) {
        const r = run(tmp, ["--once", "--since", bad]);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain(`invalid --since: ${bad}`);
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("invalid --interval warns and still runs (E9)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crasp-watch-badint-"));
    try {
      await seed(tmp, [entryLine({ outcome: "clean" })]);
      // non-TTY snapshot path doesn't use the interval, but parsing must not crash.
      const r = run(tmp, ["--once", "--interval", "abc"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("watching");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
```

> **Note (E9):** `--interval` only governs the TTY live loop; on the non-TTY/`--once`
> snapshot path it isn't consulted, so this test asserts only that a bad interval
> doesn't break the snapshot. The warn-and-fallback path itself is exercised by
> `resolveInterval` in code and can be additionally covered by a direct unit test
> if the implementer chooses to export it (optional).

- [ ] **Step 2: Build + run test to verify it fails**

Run: `pnpm build && pnpm test watch.test`
Expected: FAIL — `watch` is not a registered command (Commander errors → non-zero status; `--once` cases fail their `status === 0` assertions).

- [ ] **Step 3: Commit the tests (red)**

```bash
git add tests/cli/watch.test.ts
git commit -m "test: add CLI integration tests for crasp watch terminating paths

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: Register `watch` (the one cross-branch file) — E12

Wire the command into Commander. **This is the only task that touches `src/cli/index.ts` — the cross-branch shared file.** Append F4's block **last**, immediately before `program.parse();`.

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Add the import**

In `src/cli/index.ts`, add alongside the other command imports (after the `hookLogCommand` import line):

```ts
import { watchCommand } from "./commands/watch.js";
```

- [ ] **Step 2: Append the registration block (last, before `program.parse();`)**

```ts
program
  .command("watch")
  .description("live terminal dashboard of Crasp hook activity")
  .option("--once", "render a single snapshot and exit (also the no-TTY behaviour)")
  .option("--since <spec>", "only show activity since <spec> (e.g. 30m, 2h, 1d, or an ISO timestamp)")
  .option("--interval <ms>", "poll interval in ms for the live view (default 250)")
  .action(watchCommand);
```

Leave `program.parse();` as the final line.

- [ ] **Step 3: Build + run the integration tests to verify they pass**

Run: `pnpm build && pnpm test watch.test`
Expected: PASS — all snapshot/`--once`/no-TTY/empty/missing/`--since` (valid relative, valid ISO, invalid → non-zero) and `--interval` cases pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: register the crasp watch command

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: Documentation + final verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README**

In `README.md`, add `crasp watch` to the CLI/commands section with a short description and the ASCII mockup snippet from the design doc, plus: *"Run `crasp watch` in a spare terminal to see Crasp's decisions land live as Claude Code works; `crasp watch --once --since 1h` prints a session summary."* Document: the no-TTY behaviour (piping prints a single snapshot + a stderr notice), that `--since` accepts `Ns/Nm/Nh/Nd` (positive) or a strict ISO-8601 timestamp and **errors** on anything else, and that `--interval` defaults to 250ms (floored 50ms; bad values warn and fall back).

- [ ] **Step 2: Update CHANGELOG**

In `CHANGELOG.md`, add an `## [Unreleased]` (or next-version) entry:

```markdown
### Added
- `crasp watch` — a dependency-free live terminal dashboard that tails
  .crasp/events.ndjson and shows recent hook decisions plus running tallies
  (clean / ask / advisory / blocked / exception), updating in real time.
  `--once` renders a single snapshot; `--since <Ns|Nm|Nh|Nd|ISO>` scopes it to a
  session (invalid values are rejected). Non-TTY invocations (pipes, CI) print one
  snapshot and exit. Time is rendered in UTC for deterministic output.
```

- [ ] **Step 3: Full verification**

Run: `pnpm build && pnpm test && pnpm typecheck`
Expected: All tests pass (watch-render, watch-poll, watch.test, plus the pre-existing suite), no type errors. (The CLAUDE.md gate before any commit.)

- [ ] **Step 4: Manual smoke test**

```bash
node dist/index.js watch --once
```
Expected: one rendered frame (header "Crasp · watching .crasp/events.ndjson", event lines or the "No activity yet" placeholder, footer tallies), then the prompt returns (exit 0).

```bash
node dist/index.js watch --once --since 1h
node dist/index.js watch --once --since garbage   # → 'invalid --since: garbage' on stderr, non-zero exit
```

(Optional, interactive — not part of CI:) run `node dist/index.js watch` in a real TTY, trigger a hook in another terminal, watch a new line appear, then Ctrl-C and confirm the terminal is restored cleanly — **visible cursor, no leftover dashboard, no alt-screen residue**. Also kill it with `SIGTERM` (`kill <pid>`) and confirm the same clean restore (E5).

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document the crasp watch live dashboard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Decision coverage (E1–E12):**
  - **E1** color contract — Task 4 (`renderDashboard` strips ANSI when `color:false`, `clip` keeps escapes intact when `true`); asserted by the no-ANSI test + `clip` test.
  - **E2** UTC time + determinism — Task 2 (Vitest TZ setup) + Task 4 (`fmtTime` via `getUTC*`, exact-frame test). `hook-log`'s `formatTime` is **not** reused.
  - **E3** visible width + wide glyphs — Task 4 (`visibleWidth`/`clip`, `WIDE` set, emoji-row overflow test).
  - **E4** injectable tested tick — Task 6 (`createPoller` with injected `stat`/`readHookLog`/`clock`, read-gating + debounce, four assertions); `setInterval` is a one-line shell in Task 7.
  - **E5** crash-safe teardown — Task 7 (`writeSync(1, …)`, idempotent `cleaned` guard, `SIGINT`/`SIGTERM`/`exit`/`uncaughtException`/`unhandledRejection`, try/catch around `draw`).
  - **E6** `--since` validation — Task 3 (`parseSince` strict grammar + `INVALID_SINCE`) + Task 7 (error+exit) + Task 8 (invalid → non-zero exit tests, incl. `0m`).
  - **E7** row budget — Task 4 (`HEADER_LINES=2`, `FOOTER_LINES=3`, `SPACER_LINES=2`, empty-state clamp, small-`rows` tests for both states).
  - **E8** renderer robustness — Task 3 (`tally` ignores unknown) + Task 4 (`fmtTime` → `--:--`, `safeIcon`/`safeLabel` neutral fallback, corrupt-entry test).
  - **E9** `--interval` validation — Task 7 (`resolveInterval` warn+fallback, floor 50ms) + Task 8 (bad interval still runs).
  - **E10** `displayPath` — Task 7 (`path.relative(root, absPath)`).
  - **E11** footer legend single source — Task 4 (`footerTallies` uses `icon()`; pinned by the legend test).
  - **E12** mechanics — one commit per task, distinct files; the only shared file `src/cli/index.ts` is isolated to Task 9, block appended last; every commit carries the `Claude Fable 5` trailer.
- **Type/name consistency:** `renderDashboard` / `DashboardOptions` / `tally` / `Tallies` / `parseSince` / `INVALID_SINCE` / `fmtTime` / `visibleWidth` / `clip` / `createPoller` / `Poller` / `PollerDeps` / `watchCommand` / `WatchOptions` are identical across tasks. The renderer reuses `hook-log.ts` exports added in Task 1 before importing them in Task 4.
- **Anti-flakiness:** the renderer is pure + UTC + exact-frame-pinned; the tick is unit-tested with injected seams (no real timers, no sleeps, no subprocess); CLI integration only ever spawns terminating paths (no-TTY by construction). No test races the live loop.
- **Cross-branch shared touch point:** `src/cli/index.ts` (Task 9) — one import + one `.command("watch")` block appended last; trivially mergeable with F2's analogous addition.
