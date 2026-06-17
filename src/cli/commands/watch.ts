import { writeSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { readHookLog, hookLogPath } from "../../core/hook-log/index.js";
import { renderDashboard, parseSince, INVALID_SINCE, type DashboardOptions } from "../watch-render.js";
import { createPoller } from "../watch-poll.js";
import type { HookLogEntry } from "../../types/index.js";

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
export function resolveInterval(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_INTERVAL;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    process.stderr.write(`crasp watch: invalid --interval '${raw}', using ${DEFAULT_INTERVAL}ms\n`);
    return DEFAULT_INTERVAL;
  }
  return Math.max(MIN_INTERVAL, n);
}

/**
 * Wire crash-safe SYNCHRONOUS teardown (E5) and register it on every exit path.
 * Returns the idempotent cleanup: the first call clears the timer and restores
 * the terminal; subsequent calls (e.g. SIGINT then "exit") are no-ops.
 */
export function wireTeardown(getTimer: () => NodeJS.Timeout | undefined): () => void {
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    const timer = getTimer();
    if (timer) clearInterval(timer);
    try {
      writeSync(1, SHOW_CURSOR + LEAVE_ALT); // bytes flush during exit
    } catch {
      // nothing else we can do during teardown
    }
  };

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

  return cleanup;
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

  // Register crash-safe, idempotent teardown on every exit path (E5).
  const cleanup = wireTeardown(() => timer);

  const render = (entries: HookLogEntry[], now: Date): void => {
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

  // Enter alt-screen + hide cursor (teardown already registered via wireTeardown).
  process.stdout.write(ENTER_ALT + HIDE_CURSOR);

  await draw();
  timer = setInterval(() => { void draw(); }, intervalMs);
}
