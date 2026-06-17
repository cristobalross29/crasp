# F4 · Live Dashboard (`crasp watch`) — Design

Date: 2026-06-12
Status: approved design, pending implementation plan.

## Problem

Crasp logs every hook decision to `.crasp/events.ndjson`, but the only way to see
that activity is `crasp hook-log` — a one-shot, scroll-back-through-history view.
While Claude Code is actively working, a developer has **no live feedback**: they
cannot watch decisions land in real time, cannot see the running tally of blocks
/ asks / advisories climb, and cannot glance at a terminal to confirm "Crasp is
doing its job right now." This feature adds `crasp watch`: a live-updating
terminal dashboard that tails the event log and renders recent events plus
running counts, updating as Crasp writes new entries.

The user has already decided: **terminal TUI, not a web page.** This spec commits
to a **dependency-free** TUI built from plain ANSI escape codes + Node's `fs`
watch primitives, matching Crasp's local-first, lean-dependency ethos.

## Approved decisions

1. **Terminal TUI, not a web page.** Decided by the user. No HTTP server, no
   browser, no bundled assets.

2. **Zero new dependencies.** The dashboard is built from ANSI escape codes
   (cursor positioning, screen clear, alternate screen buffer) emitted to
   `process.stdout`, plus `node:fs`/`node:fs/promises` for reads and watching.
   We do **not** add ink, blessed, or any TUI library. Rationale and the
   rejected alternative are documented under "Dependency decision".

3. **Pure renderer / IO-loop split.** The central design move. A pure function
   `renderDashboard(entries, opts): string` takes the log entries plus a small
   options bag (terminal rows/cols, watched path, now-timestamp) and returns the
   **entire frame as one string** — no I/O, no `console.log`, no `Date.now()`
   inside it. The watch loop is a thin shell that (a) reads entries, (b) calls
   `renderDashboard`, (c) writes the frame, (d) waits for a change, repeat. The
   renderer is unit-tested directly with exact-string / region assertions; the
   thin loop is covered by a small set of CLI integration tests. This is how we
   make a live I/O loop testable.

4. **Poll-with-debounce refresh, not raw `fs.watch`.** A debounced poll on file
   size/mtime (default 250ms) is more robust than `fs.watch` across platforms and
   editor/atomic-rename quirks. Justified under "Refresh mechanism".

5. **Graceful no-TTY fallback.** If `process.stdout.isTTY` is false (piped, CI,
   redirected), `watch` does **not** attempt a TUI. It prints a one-line notice
   and a single rendered snapshot of current activity, then exits 0. It never
   hangs a non-interactive pipe.

6. **One-shot summary reuses the same renderer, gated by `--once`.** Rather than a
   separate "session summary" concern, `crasp watch --once [--since <spec>]`
   renders exactly one frame (respecting `--since`) and exits. This is the
   session-summary view; it shares 100% of the rendering code with the live loop.
   Keeps the surface lean — one command, one renderer, two run modes.

## Design

### Module split

```
src/cli/watch-render.ts     # PURE. renderDashboard(entries, opts) → string.
                            #   Plus pure helpers: header(), eventLines(),
                            #   footerTallies(), and re-used formatting.
src/cli/commands/watch.ts   # THIN IO SHELL. watchCommand(options):
                            #   parse opts → resolve TTY vs no-TTY →
                            #   run loop (read → render → write → wait).
```

The renderer imports a **subset** of the existing presentational helpers from
`src/cli/commands/hook-log.ts` so the two views stay visually consistent. It
reuses exactly four helpers: `icon`, `outcomeLabel`, `fileDisplay`,
`commandDisplay`. To import them, those four are promoted from file-private to
**exported** — an additive, non-behavioural change that adds the `export` keyword
and does **not** touch the function bodies (see "Files to change"). Nothing about
`hook-log`'s output changes.

The renderer deliberately does **not** reuse `hook-log`'s `formatTime`. That
helper formats with `getHours()/getMinutes()` (host **local** time, no seconds),
which makes any test that asserts on rendered time **timezone-flaky** and cannot
supply the `HH:MM:SS` seconds the status-line mockup requires. Instead the
renderer owns its own time formatter — see "Time formatting (UTC, in-renderer)".

### The pure renderer — `renderDashboard(entries, opts)`

```ts
export interface DashboardOptions {
  rows: number;        // terminal height (process.stdout.rows ?? 24)
  cols: number;        // terminal width  (process.stdout.columns ?? 80)
  watchPath: string;   // absolute path to events.ndjson (shown in header)
  now: Date;           // injected clock — NEVER call Date.now() inside the renderer
  color: boolean;      // chalk on/off (off for snapshot/no-TTY plain output)
}

export function renderDashboard(
  entries: HookLogEntry[],   // oldest→newest, exactly as readHookLog returns
  opts: DashboardOptions
): string;
```

Contract (this is what the unit tests pin):
- Returns a single string: a header block, a blank line, the event list, a blank
  line, a footer tally block — joined by `\n`. It does **not** itself emit any
  cursor-positioning or clear escapes; the IO shell owns the alt-screen frame.
  (Rationale: keeping ANSI cursor control out of the pure string makes assertions
  legible and lets `--once` print the same string verbatim to a normal terminal.)
- Deterministic in `(entries, opts)`. Same inputs → byte-identical output. No
  `Date.now()`, no `process.*`, no filesystem. Time is formatted in **UTC** (see
  below) so output is identical on every host timezone.
- Shows **the last N events that fit**, where N is derived from `opts.rows` minus
  the header and footer chrome (the exact line counts are pinned in the plan —
  `HEADER_LINES` and `FOOTER_LINES` must equal the number of lines actually
  emitted; see "Capacity / row budget"). Because `entries` is oldest→newest, the
  renderer slices the tail: `entries.slice(-capacity)` and prints them
  newest-at-bottom (so new events appear at the bottom edge, like a log tail). If
  `rows` is tiny, capacity floors at 1. The empty-state body is **also** clamped
  to the row budget (it must not push a fixed number of placeholder lines that
  ignores `rows`).
- Truncates long lines to `opts.cols` on **visible width** (see "Visible-width
  truncation"), so a frame never wraps and corrupts the layout, never cuts a
  multi-byte glyph in half, and never slices through the middle of an ANSI escape
  sequence.

### The color contract (`opts.color`)

`opts.color` is a real, tested switch — not a no-op. The reused helpers
(`outcomeLabel`, and indirectly `icon`) emit chalk SGR codes unconditionally. The
renderer therefore enforces the contract itself:

- **`color: false`** — the renderer STRIPS ANSI from every line before returning,
  using `/\x1b\[[0-9;]*m/g`. This is what guarantees the `--once` / no-TTY
  snapshot is plain text regardless of chalk's own auto-detection, and what lets
  unit tests assert on exact plain strings.
- **`color: true`** — colored output is kept. Truncation width is computed on an
  **ANSI-stripped copy** of each line (see "Visible-width truncation"), so a line
  is never cut mid-escape-sequence and the visible content fits `cols`.

This keeps Task 1 (`export` the helpers) strictly additive: the helpers keep
emitting chalk codes; the renderer owns stripping.

### Time formatting (UTC, in-renderer)

The renderer defines its own `fmtTime(date: Date, withSeconds = false): string`
using `getUTCHours()/getUTCMinutes()/getUTCSeconds()`:

- Event rows use `HH:MM` (UTC).
- The status line uses `HH:MM:SS` (UTC) — the seconds the mockup shows.
- A malformed/empty `ts` (e.g. `""` or `"oops"`, which **survive** `readHookLog`
  because it only skips non-JSON lines) yields `isNaN(date.getTime())` → the
  renderer renders `"--:--"` rather than `"NaN:NaN"` or throwing.

UTC makes rendered time deterministic on any host. The test suite additionally
sets `process.env.TZ = "UTC"` via a Vitest setup file (belt-and-suspenders), and
includes at least one **exact-frame** assertion (byte-for-byte, not a loose
substring) to enforce determinism.

### Layout (ASCII mockup)

A typical 80×24 frame (color stripped for the doc):

```
 Crasp · watching .crasp/events.ndjson                    Today: 42 events
 ─────────────────────────────────────────────────────────────────────────
 14:02  ✓  Write  src/index.ts          clean
 14:02  ℹ  Read   .env.local            warned Claude about secrets
 14:03  ⚠  Bash   rm -rf build          ask dialog shown
 14:03  ✓  Edit   src/cli/index.ts      clean
 14:04  🛡  Write  src/secrets.ts        BLOCKED [token-leakage]
 14:05  ⚪  Bash   rm -rf node_modules   bypassed (policy exception)
 14:05  ✓  Edit   README.md             clean

 (… newest events fill toward the bottom as activity arrives …)

 ─────────────────────────────────────────────────────────────────────────
 ✓ 33 clean   ⚠ 5 ask   ℹ 2 advisory   🛡 1 blocked   ⚪ 1 exception
 watching · Ctrl-C to exit                              updated 14:05:11
```

- **Header (line 1–2):** product tag + watched path (relativised to cwd when
  inside it), right-aligned "Today: N events" using the existing day-window
  logic. Rule line under it.
- **Event list (middle):** one line per event reusing `hook-log`'s exact format —
  `HH:MM` + `icon()` + tool (padEnd 5) + file/command column + `outcomeLabel()`.
  Bash entries use the command column (mirroring hook-log's `commandDisplay`).
- **Footer (last 2 lines):** rule line, then the running tally across the
  **currently loaded window** (not the 30-day summary — this is a live counter),
  then a status line (`watching · Ctrl-C to exit` + `updated HH:MM:SS`).

### Refresh mechanism — debounced poll (chosen) vs `fs.watch` (rejected)

**Chosen: poll `stat()` on the ndjson file every `pollMs` (default 250).** On each
tick, compare `(size, mtimeMs)` to the last seen pair. The tick is **read-gated**:

- **Unchanged signature** → do **not** re-read the file. Re-render the **cached**
  entries (a clock-only refresh that advances the `updated HH:MM:SS` status line
  cheaply). No `readHookLog`.
- **Changed signature** → `readHookLog(root)`, cache the result, re-render.
- A **trailing debounce** coalesces a burst of appends (Claude firing many hooks
  in a second) into at most one re-read+render per `pollMs` window, so the screen
  never thrashes.

This corrects the naive "re-read the whole file 4×/sec, every tick" loop.

#### The tick is a unit-testable unit (the #1 implementation risk)

The live-loop body is extracted into a pure-ish function (call it
`createPoller`/`pollTick`) with **injected** `stat`, clock, and `readHookLog`, and
an injected "schedule" seam in place of `setInterval`. The infinite `setInterval`
wrapper is a thin shell that simply calls the tick on a timer. The tick logic is
fully unit-tested by firing ticks deterministically and asserting:

1. first tick **reads + renders**;
2. a tick with an **unchanged** `(size, mtime)` signature does **not** re-read
   (renders cached entries only);
3. a tick with a **changed** signature **re-reads**;
4. a burst within one debounce window **coalesces** to a single re-read+render.

Because `stat`, the clock, and `readHookLog` are injected, the test fires ticks
synchronously and asserts on call counts — **no subprocess, no real timers, no
sleeps, zero flakiness**. This replaces the previous spec's "argued structurally,
not tested" stance for the loop body.

Why not `fs.watch`:
- `fs.watch` semantics differ by platform (inotify vs FSEvents vs polling
  fallback) and can deliver `rename` instead of `change`, drop events under load,
  or fire twice per write.
- `readHookLog`'s own `--prune` path can **atomically rewrite** the file
  (`writeFile` of a fresh copy). On some platforms an atomic rename invalidates an
  `fs.watch` watcher silently — the dashboard would stop updating with no error.
  A `stat`-based poll re-stats the path by name every tick and is immune to this.
- Appends are the dominant case and small; a 250ms `stat` poll is negligible cost
  and trivially correct.

`fs.watchFile` (Node's built-in stat-polling watcher) is essentially this
mechanism; we implement the poll explicitly with `setInterval` so the debounce,
teardown, and test seams are under our control rather than Node's.

### No-TTY / non-interactive fallback

```
if (!process.stdout.isTTY) {
  // piped, redirected, or CI — do not start a live loop
  print one-line notice to stderr:
    "crasp watch: not a TTY — printing a one-shot snapshot (use --once to silence this)."
  read entries once → renderDashboard(entries, { color:false, now:new Date(), ... })
  write the frame to stdout
  exit 0
}
```

This guarantees `crasp watch | cat`, `crasp watch > out.txt`, and CI invocations
terminate immediately with a useful snapshot instead of hanging on an interactive
loop. `--once` forces this single-snapshot path even on a TTY (and suppresses the
"not a TTY" notice).

### Teardown (TTY mode)

On entry the loop:
1. Switches to the **alternate screen buffer** (`\x1b[?1049h`) and hides the
   cursor (`\x1b[?25l`).
2. Installs `SIGINT` (and `SIGTERM`) handlers and an `exit` handler.

On exit (Ctrl-C, signal, or error) a single idempotent `cleanup()`:
1. Clears the poll interval.
2. Shows the cursor (`\x1b[?25h`) and leaves the alternate screen (`\x1b[?1049l`)
   — this restores the user's prior terminal contents, so the dashboard leaves no
   scrollback litter.

**Crash-safe synchronous teardown.** `cleanup()` writes the restore bytes with
`fs.writeSync(1, …)` — a **synchronous** write to fd 1 — so the bytes flush
during process teardown (an async `process.stdout.write` may be dropped when the
event loop is torn down by `process.exit`). It is guarded by a `cleaned` flag so
multiple signals can't double-run it.

`cleanup()` is registered on **`SIGINT`, `SIGTERM`, `exit`,
`uncaughtException`, and `unhandledRejection`**. The `uncaughtException` /
`unhandledRejection` handlers run `cleanup()` then `process.exit(1)`. The loop's
`draw()` is wrapped in `try/catch` that triggers `cleanup()` on a fatal error.
Together these **guarantee** the terminal is never left with a hidden cursor or
stuck in the alt-screen, on any exit path.

### Frame writing (TTY mode)

Each refresh writes: `\x1b[H` (cursor home) + `\x1b[2J` (clear) + the rendered
frame. Clearing the whole screen each frame (rather than diffing) is simple and
correct for a log that only grows; at 250ms cadence flicker is imperceptible and
we avoid a diff engine. If profiling ever shows flicker we can switch to
`\x1b[H` + per-line `\x1b[K` erase-to-end without touching the pure renderer.

### Empty-log and missing-`.crasp/` cases

`readHookLog(root)` already returns `[]` when the file is missing or empty (it
swallows the read error). So both cases collapse to "zero entries", and the
renderer handles zero entries by showing a centred placeholder in the event
region:

```
 Crasp · watching .crasp/events.ndjson                     Today: 0 events
 ─────────────────────────────────────────────────────────────────────────

              No activity yet — Crasp will show hook decisions here
                       as Claude Code works.

 ─────────────────────────────────────────────────────────────────────────
 ✓ 0 clean   ⚠ 0 ask   ℹ 0 advisory   🛡 0 blocked   ⚪ 0 exception
 watching · Ctrl-C to exit                              updated 14:05:11
```

In TTY mode we still start the poll loop even when empty, so the first hook
decision appears live. In no-TTY / `--once` mode we print this placeholder frame
and exit.

### `--since` (session summary)

`--since <spec>` filters entries before rendering. Spec forms (parsed in the thin
shell, not the renderer): a relative duration or an ISO-8601 timestamp. Parsing
lives in a tiny pure helper, unit-testable independently of the loop.

**Strict grammar — bad input is an error, not a silent "show everything".**

- Relative: `^\d+[smhd]$` with a **positive** integer (so `30m`, `2h`, `1d`, `45s`
  are valid; `0m` and `0s` are **invalid** — a non-positive window is a mistake).
- Absolute: a **strict** ISO-8601 timestamp, validated by parsing and round-trip /
  format checking — **not** loose `Date.parse` (which accepts `"3"`,
  `"March 2026"`, etc.).
- Anything else non-empty (e.g. `30min`, `garbage`, `0m`) is **INVALID**.

The parser distinguishes three results: *absent* (`undefined` spec → no filter),
*valid* (a `Date`), and *invalid* (a sentinel/throw the shell can detect). On an
**invalid** value the watch shell prints `invalid --since: <value>` to **stderr**
and exits **non-zero**. It does **not** silently fall back to showing all history
— that footgun (and the test that enshrined it) is removed. With a valid `--since`
and `--once`, the result is a clean "what happened in this session" snapshot;
without `--once` the live view starts from that floor and grows.

`--interval <ms>` is likewise parsed explicitly: non-numeric / non-positive input
is handled by a documented **warn-and-fallback** to the 250ms default (floored at
50ms), printed to stderr. (Implementation picks warn-fallback over hard-error so a
fat-fingered interval still launches the dashboard.)

## Running tallies

The footer counts are computed by a pure helper over the **loaded window**:

```ts
export interface Tallies {
  clean: number; ask: number; advisory: number; blocked: number; exception: number;
}
export function tally(entries: HookLogEntry[]): Tallies;
```

(`blocked` counts `outcome === "denied"`, matching `hook-log`'s vocabulary; the
label says "blocked".) This is distinct from `hook-log`'s `buildSummary`, which is
a fixed 30-day window — the dashboard counter reflects exactly what is on screen's
data set (everything loaded, after any `--since`).

`tally()` tolerates **unknown** `outcome` values (a corrupt-but-JSON-valid entry
that survives `readHookLog`): they are ignored (not bucketed) and never throw.
Likewise the renderer renders an unknown `outcome`/`tool` with a **neutral** icon
(`"·"`) and a neutral label rather than crashing on an unmatched `switch`.

## Files to change

- `src/cli/watch-render.ts` — **new** — pure `renderDashboard()`, `tally()`,
  `parseSince()`, `fmtTime()`, `visibleWidth()`, `clip()`, and the layout helpers.
  Owns the color-strip and UTC-time logic.
- `src/cli/watch-poll.ts` — **new** — the extracted, injectable poll tick
  (`createPoller`/`pollTick`): read-gated on `(size, mtime)`, caches entries,
  trailing debounce. Injected `stat` / clock / `readHookLog` for unit testing.
- `src/cli/commands/watch.ts` — **new** — thin IO shell `watchCommand()`: TTY vs
  no-TTY branch, `--since`/`--interval` validation, the `setInterval` wrapper
  around the tick, alt-screen + crash-safe synchronous teardown.
- `src/cli/commands/hook-log.ts` — **modify (additive only)** — `export` the four
  presentational helpers `icon`, `outcomeLabel`, `fileDisplay`, `commandDisplay`
  so the renderer reuses them. Bodies untouched; no output change. (`formatTime`
  is **not** exported/reused — the renderer owns UTC time.)
- `src/cli/index.ts` — **modify (additive only)** — register the `watch` command.
  **This is the only file F4 shares with the parallel F2 branch** (both add a
  `program.command(...)` block). See "Cross-branch shared touch point".
- `src/types/index.ts` — **no change**. `HookLogEntry` already covers everything
  the dashboard reads (including `tool: "Bash"`).
- `tests/setup.ts` — **new** — Vitest setup file that sets `process.env.TZ = "UTC"`
  (belt-and-suspenders determinism), wired via `setupFiles` in `vitest.config.ts`.
- `vitest.config.ts` — **modify (additive)** — add `setupFiles: ["tests/setup.ts"]`.
- `tests/cli/watch-render.test.ts` — **new** — unit tests of the pure renderer,
  `tally`, `parseSince`, including an **exact-frame** assertion, emoji/wide-glyph
  width tests, corrupt-entry robustness, and color-strip behaviour.
- `tests/cli/watch-poll.test.ts` — **new** — unit tests of the injectable tick
  (read-gating + debounce + coalescing) with injected seams.
- `tests/cli/watch.test.ts` — **new** — CLI integration: no-TTY snapshot, `--once`,
  `--since` (valid + invalid), empty-log, missing-`.crasp/`, exit code.
- `README.md`, `CHANGELOG.md` — **modify** — document `crasp watch`.

F4 does **not** touch `setup.ts` (no new hook is installed — `watch` is a manual
command), nor `check.ts`, nor any core module. The log format is consumed
read-only.

### Cross-branch shared touch point

`src/cli/index.ts` is the single file both F2 and F4 will edit, each adding one
independent `program.command("…")` registration block. F4's edit is purely
additive: one import line and one ~6-line `.command("watch")` block appended
near the other registrations. The two branches touch **different command names**
and **different lines**, so a merge is a trivial both-sides-add (at worst a
2-line manual resolution). The plan calls this out explicitly and instructs the
implementer to append F4's block at the end of the registration list to minimise
line overlap with F2.

## Testability — the central design challenge

A live I/O loop is hard to test without flakiness. The split makes it tractable:

1. **The pure renderer carries the logic and the risk.** Layout, slicing,
   truncation, tallies, empty-state, `--since` filtering, Bash-vs-file column
   choice — all live in `renderDashboard`/`tally`/`parseSince`, which are pure
   functions of their arguments. They are tested with **exact-string and region
   assertions** against hand-built `HookLogEntry[]` fixtures and a **fixed
   injected `now`** — zero timing, zero process, zero flakiness.

2. **The poll tick is extracted and unit-tested with injected seams.** The live
   loop's only non-trivial logic — "stat → gate read on signature change →
   debounce → render" — is factored into a tick unit with injected `stat`, clock,
   and `readHookLog`. A Vitest unit fires ticks synchronously and asserts call
   counts (first tick reads; unchanged signature → no re-read; changed signature →
   re-read; burst → coalesced). **No subprocess, no real timers, no sleeps.** The
   infinite `setInterval` wrapper is the only untested line, and it is a one-line
   `setInterval(tick, ms)` shell.

3. **The IO shell's terminating edges are covered by CLI integration tests.**
   These spawn `node dist/index.js watch …` and assert on a **terminating**
   invocation only:
   - `--once` (and the implicit no-TTY path, since `spawnSync`'s stdout is a pipe,
     not a TTY) renders one frame and **exits 0** — assert exit code + that stdout
     contains expected icons/labels for the seeded entries.
   - empty-log / missing `.crasp/` → exits 0 with the placeholder text.
   - `--since 1h` vs `--since 1d` change which seeded entries appear.
   - **invalid `--since`** (`30min`, `garbage`, `0m`) → stderr `invalid --since:`
     + **non-zero** exit.

   We **never** spawn the infinite live loop in a test and try to "catch" a frame
   — that is the flaky path and we avoid it entirely.

## Out of scope (fast-follow)

- A web dashboard (explicitly rejected by the user).
- Interactive controls inside the TUI (scrollback, filtering by outcome, pause).
  v1 always tails the newest events.
- Multi-project / multi-log aggregation.
- Diff-based frame rendering (full clear each frame is fine at this cadence).
- Persisting a session report file (`--once` prints to stdout; redirect if you
  want a file).

## Open questions (documented decisions, not blockers)

- **Driving the poll tick in a unit test.** ~~Optional fast-follow.~~ **Resolved:
  required in v1.** The tick is extracted with injected `stat`/clock/`readHookLog`
  and unit-tested directly (read-gating + debounce). See "The tick is a
  unit-testable unit" — this is the single biggest correctness risk and is no
  longer deferred.
- **`--since` duration grammar.** v1 supports `^\d+[smhd]$` with a **positive**
  integer, plus **strict** ISO-8601. Invalid input is an **error** (stderr +
  non-zero exit), not a silent show-all. Cron-ish or natural-language specs are
  out of scope.
