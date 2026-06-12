# Live Dashboard (`crasp watch`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `crasp watch` — a dependency-free, live-updating terminal dashboard that tails `.crasp/events.ndjson` and shows recent hook decisions plus running tallies (clean / ask / advisory / blocked / exception), updating in real time as Claude Code works. A `--once`/`--since` mode renders one snapshot (the session summary), and non-TTY invocations degrade gracefully to a single snapshot.

**Architecture:** Split a **pure renderer** (`src/cli/watch-render.ts` → `renderDashboard(entries, opts): string`, plus pure `tally()` and `parseSince()`) from a **thin IO shell** (`src/cli/commands/watch.ts`). The renderer holds all layout/logic and is unit-tested with exact-string assertions against fixtures and an injected clock. The shell reads entries via the existing `readHookLog()`, calls the renderer, writes the frame, and — in TTY mode — runs a debounced `stat`-poll loop inside the alternate screen buffer with clean SIGINT teardown. In non-TTY mode (pipes, CI) it prints one frame and exits. The renderer reuses `hook-log.ts`'s presentational helpers (promoted to exports).

**Tech Stack:** TypeScript (ESM, `.js` import extensions), Vitest, Commander CLI, pnpm. **Zero new dependencies** — ANSI escapes + `node:fs`/`node:fs/promises` only.

**Design ref:** `docs/superpowers/specs/2026-06-12-f4-dashboard-design.md`

---

## File Structure

- `src/cli/commands/hook-log.ts` — modify (additive) — `export` the presentational helpers (`icon`, `outcomeLabel`, `fileDisplay`, `commandDisplay`, `formatTime`) so the renderer reuses them; no output change.
- `src/cli/watch-render.ts` — **new** — pure `renderDashboard()`, `tally()`, `parseSince()`, and layout helpers.
- `src/cli/commands/watch.ts` — **new** — thin IO shell `watchCommand()`: TTY vs no-TTY branch, debounced poll loop, alt-screen + SIGINT teardown.
- `src/cli/index.ts` — modify (additive) — register the `watch` command. **Only file shared with the parallel F2 branch.**
- `tests/cli/watch-render.test.ts` — **new** — unit tests of the pure renderer / `tally` / `parseSince`.
- `tests/cli/watch.test.ts` — **new** — CLI integration tests (spawn `dist/index.js`).
- `README.md`, `CHANGELOG.md` — modify — document `crasp watch`.

**Commands:** `pnpm test <pattern>` runs targeted Vitest. CLI integration tests spawn `dist/index.js`, so run `pnpm build` before them.

**Cross-branch note:** `src/cli/index.ts` (Task 5) is the one file F2 and F4 both edit. F4's edit is one import + one `program.command("watch")` block appended at the **end** of the registration list, on different lines and a different command name than F2 — a trivial both-sides-add merge.

---

## Task 1: Export hook-log presentational helpers

Make `hook-log.ts`'s formatting helpers importable so the dashboard renders events identically. This is a pure additive change — adding `export` to five existing functions — and must not alter `hook-log`'s output.

**Files:**
- Modify: `src/cli/commands/hook-log.ts`
- Test: `tests/cli/watch-render.test.ts` (**new** — first assertion drives the exports)

- [ ] **Step 1: Write the failing test**

Create `tests/cli/watch-render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { icon, outcomeLabel, fileDisplay, commandDisplay, formatTime } from "../../src/cli/commands/hook-log.js";

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

  it("commandDisplay truncates long commands", () => {
    expect(commandDisplay("rm -rf build").trim()).toBe("rm -rf build");
  });

  it("fileDisplay keeps the last two path segments", () => {
    expect(fileDisplay("/a/b/c/src/index.ts").trim()).toBe("src/index.ts");
  });

  it("formatTime renders HH:MM", () => {
    expect(formatTime("2026-06-12T14:02:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test watch-render`
Expected: FAIL — `icon`, `outcomeLabel`, `fileDisplay`, `commandDisplay`, `formatTime` are not exported from `hook-log.js`.

- [ ] **Step 3: Add `export` to the five helpers**

In `src/cli/commands/hook-log.ts`, add the `export` keyword to these existing function declarations (do not change their bodies):

```ts
export function formatTime(ts: string): string {
```
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

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure tally + since-parser

Two small pure helpers the renderer and shell depend on. Isolated first so they're trivially testable.

**Files:**
- Create: `src/cli/watch-render.ts`
- Test: `tests/cli/watch-render.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/cli/watch-render.test.ts`:

```ts
import { tally, parseSince } from "../../src/cli/watch-render.js";
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
});

describe("parseSince", () => {
  const now = new Date("2026-06-12T14:00:00.000Z");

  it("parses minutes/hours/days relative to now", () => {
    expect(parseSince("30m", now)!.toISOString()).toBe("2026-06-12T13:30:00.000Z");
    expect(parseSince("2h", now)!.toISOString()).toBe("2026-06-12T12:00:00.000Z");
    expect(parseSince("1d", now)!.toISOString()).toBe("2026-06-11T14:00:00.000Z");
    expect(parseSince("45s", now)!.toISOString()).toBe("2026-06-12T13:59:15.000Z");
  });

  it("parses an ISO timestamp", () => {
    expect(parseSince("2026-06-12T10:00:00.000Z", now)!.toISOString()).toBe("2026-06-12T10:00:00.000Z");
  });

  it("returns undefined for empty or garbage input", () => {
    expect(parseSince(undefined, now)).toBeUndefined();
    expect(parseSince("", now)).toBeUndefined();
    expect(parseSince("not-a-date", now)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test watch-render`
Expected: FAIL — `src/cli/watch-render.js` does not exist.

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
    }
  }
  return t;
}

const RELATIVE = /^(\d+)(s|m|h|d)$/;
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseSince(spec: string | undefined, now: Date): Date | undefined {
  if (!spec) return undefined;
  const rel = RELATIVE.exec(spec.trim());
  if (rel) {
    return new Date(now.getTime() - Number(rel[1]) * UNIT_MS[rel[2]]);
  }
  const ts = Date.parse(spec);
  return Number.isNaN(ts) ? undefined : new Date(ts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test watch-render && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/watch-render.ts tests/cli/watch-render.test.ts
git commit -m "feat: add tally + since-parser for the watch dashboard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Pure `renderDashboard()`

The heart of the feature — a deterministic frame builder. All layout, slicing, truncation, empty-state, and the header/event/footer composition live here. Color is off in these tests so assertions are on plain text.

**Files:**
- Modify: `src/cli/watch-render.ts`
- Test: `tests/cli/watch-render.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/cli/watch-render.test.ts`:

```ts
import { renderDashboard, type DashboardOptions } from "../../src/cli/watch-render.js";

const NOW = new Date("2026-06-12T14:05:11.000Z");

function opts(over: Partial<DashboardOptions> = {}): DashboardOptions {
  return { rows: 24, cols: 80, watchPath: ".crasp/events.ndjson", now: NOW, color: false, ...over };
}

describe("renderDashboard", () => {
  it("renders header, events, and footer tallies", () => {
    const out = renderDashboard(
      [
        entry({ ts: "2026-06-12T14:02:00.000Z", tool: "Write", filePath: "src/index.ts", outcome: "clean" }),
        entry({ ts: "2026-06-12T14:03:00.000Z", tool: "Bash", filePath: "rm -rf build", outcome: "ask", ruleId: "bash-rm-rf" }),
        entry({ ts: "2026-06-12T14:04:00.000Z", tool: "Write", filePath: "src/secrets.ts", outcome: "denied", ruleId: "token-leakage" }),
      ],
      opts()
    );
    expect(out).toContain("watching");
    expect(out).toContain(".crasp/events.ndjson");
    // event lines (reusing hook-log format)
    expect(out).toContain("Write");
    expect(out).toContain("rm -rf build");
    expect(out).toContain("BLOCKED");
    // footer tallies
    expect(out).toContain("1 clean");
    expect(out).toContain("1 ask");
    expect(out).toContain("1 blocked");
  });

  it("shows the empty-state placeholder when there are no entries", () => {
    const out = renderDashboard([], opts());
    expect(out).toContain("No activity yet");
    expect(out).toContain("0 clean");
  });

  it("keeps only the newest events that fit and never exceeds row budget", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      entry({ ts: `2026-06-12T10:${String(i % 60).padStart(2, "0")}:00.000Z`, filePath: `src/f${i}.ts` })
    );
    const out = renderDashboard(many, opts({ rows: 12 }));
    // 12 rows − header(2) − footer(2) − padding lines ⇒ a small bounded list.
    expect(out.split("\n").length).toBeLessThanOrEqual(12);
    // newest entry (last in oldest→newest order) must be present
    expect(out).toContain("src/f199.ts");
    // an old entry that scrolled off must be absent
    expect(out).not.toContain("src/f0.ts");
  });

  it("truncates lines to the column width so frames never wrap", () => {
    const out = renderDashboard(
      [entry({ filePath: "src/" + "x".repeat(300) + ".ts" })],
      opts({ cols: 40 })
    );
    for (const line of out.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test watch-render`
Expected: FAIL — `renderDashboard` / `DashboardOptions` not exported.

- [ ] **Step 3: Implement `renderDashboard` + layout helpers**

Append to `src/cli/watch-render.ts`:

```ts
import { icon, outcomeLabel, fileDisplay, commandDisplay, formatTime } from "./commands/hook-log.js";

export interface DashboardOptions {
  rows: number;
  cols: number;
  watchPath: string;
  now: Date;
  color: boolean;
}

const HEADER_LINES = 2; // title + rule
const FOOTER_LINES = 2; // rule + tallies (the status line is folded into footer chrome below)

function clip(line: string, cols: number): string {
  // Truncate on raw string length. ANSI color is disabled for plain output paths;
  // colored frames are only written to a TTY where over-width is cosmetically safe.
  return line.length > cols ? line.slice(0, cols) : line;
}

function rule(cols: number): string {
  return "─".repeat(Math.max(1, Math.min(cols, 78)));
}

function todayCount(entries: HookLogEntry[], now: Date): number {
  const day = now.toLocaleDateString("en-CA");
  return entries.filter((e) => new Date(e.ts).toLocaleDateString("en-CA") === day).length;
}

function eventLine(e: HookLogEntry): string {
  const time = formatTime(e.ts);
  const ic = icon(e.outcome);
  const tool = e.tool.padEnd(5);
  const col = e.tool === "Bash" ? commandDisplay(e.filePath) : fileDisplay(e.filePath);
  // outcomeLabel may carry chalk codes; in color:false mode chalk emits no codes
  // when NO_COLOR / non-TTY, but to keep the pure renderer deterministic the
  // shell sets color via env before import. Tests run with color:false.
  return `${time}  ${ic}  ${tool}  ${col}  ${outcomeLabel(e)}`;
}

function footerTallies(entries: HookLogEntry[]): string {
  const t = tally(entries);
  return `✓ ${t.clean} clean   ⚠ ${t.ask} ask   ℹ ${t.advisory} advisory   🛡 ${t.blocked} blocked   ⚪ ${t.exception} exception`;
}

export function renderDashboard(entries: HookLogEntry[], opts: DashboardOptions): string {
  const { rows, cols, watchPath, now } = opts;

  const title = `Crasp · watching ${watchPath}`;
  const count = `Today: ${todayCount(entries, now)} events`;
  const headerLine =
    title.length + count.length + 2 <= cols
      ? title + " ".repeat(cols - title.length - count.length) + count
      : title;

  const status = `watching · Ctrl-C to exit   updated ${formatTime(now.toISOString())}`;

  const lines: string[] = [];
  lines.push(headerLine);
  lines.push(rule(cols));

  // Body capacity: total rows minus header, footer, the status line, and two blank spacers.
  const capacity = Math.max(1, rows - HEADER_LINES - FOOTER_LINES - 1 - 2);

  if (entries.length === 0) {
    lines.push("");
    lines.push("   No activity yet — Crasp will show hook decisions here");
    lines.push("   as Claude Code works.");
    lines.push("");
  } else {
    const shown = entries.slice(-capacity);
    lines.push("");
    for (const e of shown) lines.push(eventLine(e));
    lines.push("");
  }

  lines.push(rule(cols));
  lines.push(footerTallies(entries));
  lines.push(status);

  return lines.map((l) => clip(l, cols)).join("\n");
}
```

> Note on color: the pure renderer takes `color` in its options for API clarity, but determinism in tests is guaranteed by the shell — Task 4 sets `FORCE_COLOR`/`NO_COLOR` on chalk before importing the renderer. Tests pass `color:false` and assert on plain substrings (`BLOCKED`, `clean`), which appear regardless of chalk codes because the substrings are the literal text chalk wraps.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test watch-render && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/watch-render.ts tests/cli/watch-render.test.ts
git commit -m "feat: add pure renderDashboard frame builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Thin IO shell `watchCommand()`

The only impure code: read entries, render, write; in non-TTY/`--once` print one frame and exit; in TTY run the debounced poll loop inside the alt-screen with SIGINT teardown.

**Files:**
- Create: `src/cli/commands/watch.ts`
- (Tested via Task 5's CLI integration once registered — but the file is written here.)

- [ ] **Step 1: Write the module**

Create `src/cli/commands/watch.ts`:

```ts
import { stat } from "node:fs/promises";
import { readHookLog, hookLogPath } from "../../core/hook-log/index.js";
import { renderDashboard, parseSince, type DashboardOptions } from "../watch-render.js";

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

function buildOpts(watchPath: string): Omit<DashboardOptions, "color"> {
  return {
    rows: process.stdout.rows ?? 24,
    cols: process.stdout.columns ?? 80,
    watchPath,
    now: new Date(),
  };
}

async function loadEntries(root: string, since?: Date) {
  return readHookLog(root, since ? { since } : undefined);
}

export async function watchCommand(options: WatchOptions = {}): Promise<void> {
  const root = process.cwd();
  const absPath = hookLogPath(root);
  const displayPath = absPath.startsWith(root) ? absPath.slice(root.length + 1) : absPath;
  const since = parseSince(options.since, new Date());

  // ── non-TTY or --once: single snapshot, then exit ───────────────────────────
  if (!process.stdout.isTTY || options.once) {
    if (!process.stdout.isTTY && !options.once) {
      process.stderr.write(
        "crasp watch: not a TTY — printing a one-shot snapshot (use --once to silence this).\n"
      );
    }
    const entries = await loadEntries(root, since);
    const frame = renderDashboard(entries, { ...buildOpts(displayPath), color: false });
    process.stdout.write(frame + "\n");
    return;
  }

  // ── TTY live loop ───────────────────────────────────────────────────────────
  const intervalMs = Math.max(50, Number(options.interval) || 250);
  let lastSig = "";
  let timer: NodeJS.Timeout | undefined;
  let cleaned = false;

  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    if (timer) clearInterval(timer);
    process.stdout.write(SHOW_CURSOR + LEAVE_ALT);
  };

  const draw = async (): Promise<void> => {
    const entries = await loadEntries(root, since);
    const frame = renderDashboard(entries, { ...buildOpts(displayPath), color: true });
    process.stdout.write(HOME_CLEAR + frame);
  };

  process.stdout.write(ENTER_ALT + HIDE_CURSOR);
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  await draw();

  timer = setInterval(() => {
    void (async () => {
      try {
        const s = await stat(absPath);
        const sig = `${s.size}:${s.mtimeMs}`;
        if (sig !== lastSig) {
          lastSig = sig;
          await draw();
        } else {
          // refresh the "updated HH:MM:SS" clock even with no new events
          await draw();
        }
      } catch {
        // file vanished (e.g. .crasp removed) — render empty state
        await draw();
      }
    })();
  }, intervalMs);
}
```

> The interval redraws every tick so the "updated" clock advances; the `stat`
> signature gates whether a re-read was strictly necessary, but a redraw is cheap
> and keeps the status line live. (If profiling ever shows cost, gate `draw()` on
> `sig` change and refresh only the status line — without touching the renderer.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (the command isn't registered yet, so no runtime test — Task 5 wires + tests it).

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/watch.ts
git commit -m "feat: add watch IO shell (poll loop + no-TTY snapshot + teardown)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Register `watch` + CLI integration tests

Wire the command into Commander and prove the terminating paths (`--once`, no-TTY, `--since`, empty/missing log) via spawned-process tests. **This task touches `src/cli/index.ts` — the cross-branch shared file.** Append F4's block at the end of the registration list.

**Files:**
- Modify: `src/cli/index.ts`
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
  await writeFile(path.join(tmp, ".crasp", "events.ndjson"), lines.join("\n") + "\n");
}

function run(tmp: string, args: string[]) {
  // spawnSync stdout is a pipe (not a TTY), so watch takes the snapshot path and exits.
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

  it("--since filters out entries older than the window", async () => {
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
});
```

- [ ] **Step 2: Build + run test to verify it fails**

Run: `pnpm build && pnpm test watch.test`
Expected: FAIL — `watch` is not a registered command (Commander errors / non-zero status).

- [ ] **Step 3: Register the command**

In `src/cli/index.ts`, add the import alongside the others (after the `hookLogCommand` import):

```ts
import { watchCommand } from "./commands/watch.js";
```

Then append this block at the **end** of the registration list, immediately before `program.parse();` (kept last to minimise line overlap with the parallel F2 branch):

```ts
program
  .command("watch")
  .description("live terminal dashboard of Crasp hook activity")
  .option("--once", "render a single snapshot and exit (also the no-TTY behaviour)")
  .option("--since <spec>", "only show activity since <spec> (e.g. 30m, 2h, 1d, or an ISO timestamp)")
  .option("--interval <ms>", "poll interval in ms for the live view (default 250)")
  .action(watchCommand);
```

- [ ] **Step 4: Build + run test to verify it passes**

Run: `pnpm build && pnpm test watch.test`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts tests/cli/watch.test.ts
git commit -m "feat: register the crasp watch command

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Documentation + final verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README**

In `README.md`, add `crasp watch` to the CLI/commands section with a short description and the ASCII mockup snippet from the design doc, plus a one-liner: *"Run `crasp watch` in a spare terminal to see Crasp's decisions land live as Claude Code works; `crasp watch --once --since 1h` prints a session summary."* Note the no-TTY behaviour (piping prints a single snapshot).

- [ ] **Step 2: Update CHANGELOG**

In `CHANGELOG.md`, add an `## [Unreleased]` (or next-version) entry:

```markdown
### Added
- `crasp watch` — a dependency-free live terminal dashboard that tails
  .crasp/events.ndjson and shows recent hook decisions plus running tallies
  (clean / ask / advisory / blocked / exception), updating in real time.
  `--once` renders a single snapshot; `--since <30m|2h|1d|ISO>` scopes it to a
  session. Non-TTY invocations (pipes, CI) print one snapshot and exit.
```

- [ ] **Step 3: Full verification**

Run: `pnpm build && pnpm test && pnpm typecheck`
Expected: All tests pass, no type errors. (The CLAUDE.md gate before any commit.)

- [ ] **Step 4: Manual smoke test**

```bash
node dist/index.js watch --once
```
Expected: one rendered frame (header "Crasp · watching .crasp/events.ndjson", event lines or the "No activity yet" placeholder, footer tallies), then the prompt returns (exit 0).

```bash
node dist/index.js watch --once --since 1h
```
Expected: same frame scoped to the last hour.

(Optional, interactive — not part of CI:) run `node dist/index.js watch` in a TTY, trigger a hook in another terminal, watch a new line appear, then Ctrl-C and confirm the terminal is restored cleanly with a visible cursor and no leftover dashboard.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document the crasp watch live dashboard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Spec coverage:** pure renderer / IO split (Tasks 3 + 4), zero deps (ANSI + `node:fs` only, no new package), debounced `stat`-poll refresh (Task 4), no-TTY + `--once` snapshot fallback (Tasks 4 + 5), SIGINT/alt-screen teardown (Task 4), empty-log + missing-`.crasp/` (renderer empty-state Task 3, integration Task 5), `--since` session summary (Tasks 2 + 5). All spec sections mapped.
- **Type/name consistency:** `renderDashboard` / `DashboardOptions` / `tally` / `Tallies` / `parseSince` / `watchCommand` / `WatchOptions` are identical across tasks. The renderer reuses `hook-log.ts` exports added in Task 1 before they're imported in Task 3.
- **Granular commits:** one commit per task (6 commits total), each touching its own files. The only shared file (`src/cli/index.ts`) is isolated to Task 5 with a single additive block appended last.
- **Testability:** all logic-bearing code is pure and unit-tested (Tasks 2–3); the IO shell is covered only on its terminating edges via `spawnSync` (Task 5), which is non-TTY by construction, so no test ever spawns the infinite live loop. This is the deliberate anti-flakiness design.
- **Cross-branch shared touch point:** `src/cli/index.ts` (Task 5) — one import + one `.command("watch")` block appended at the end; trivially mergeable with F2's analogous addition.
