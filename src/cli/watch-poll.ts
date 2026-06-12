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

    const firstObservation = lastSig === undefined;
    const changed = sig !== lastSig;
    lastSig = sig;

    if (!changed) {
      // Clock-only refresh: re-render the cache cheaply, NO file read (E4).
      render(cache, clock());
      return;
    }

    // The very first observation reads immediately — there is no prior frame to
    // debounce against. Only subsequent rapid changes coalesce within the window.
    if (debounceMs <= 0 || firstObservation) {
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
