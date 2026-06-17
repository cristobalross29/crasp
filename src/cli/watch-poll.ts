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
}

export function createPoller(deps: PollerDeps): Poller {
  const { stat, readHookLog, render, clock, debounceMs } = deps;

  let lastSig: string | undefined;
  let cache: HookLogEntry[] = [];
  // The signature of a change we have observed but not yet served (trailing debounce).
  let pendingSig: string | undefined;
  let pendingSince = 0; // clock ms of the first un-served change in the window

  async function read(sig: string): Promise<void> {
    // Commit the served signature only once the read actually fires.
    lastSig = sig;
    pendingSig = undefined;
    pendingSince = 0;
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
      pendingSig = undefined;
      pendingSince = 0;
      cache = [];
      render(cache, clock());
      return;
    }

    const firstObservation = lastSig === undefined && pendingSig === undefined;
    const nowMs = clock().getTime();

    if (sig !== lastSig) {
      // A change relative to what we last SERVED.
      if (debounceMs <= 0 || firstObservation) {
        // No prior frame to debounce against (or debouncing disabled) — read now.
        await read(sig);
        return;
      }
      // Trailing debounce: remember the latest pending signature; coalesce a
      // burst by only starting the window on the FIRST un-served change.
      if (pendingSig === undefined) pendingSince = nowMs;
      pendingSig = sig;
    }

    // On EVERY tick, if a debounced read is pending and the window has elapsed,
    // flush it regardless of whether the signature changed this tick. This is
    // what keeps a steadily-growing file from being starved.
    if (pendingSig !== undefined && nowMs - pendingSince >= debounceMs) {
      await read(pendingSig);
      return;
    }

    // Otherwise a cheap clock-only refresh (no file read): either nothing
    // changed, or a read is pending but still inside its window.
    render(cache, clock());
  }

  return { tick };
}
