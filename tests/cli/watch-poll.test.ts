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

  it("trailing debounce flushes on a later tick with NO manual flush (E4)", async () => {
    const h = harness({ debounceMs: 100 });
    h.setStat(10, 100);
    await h.poller.tick();              // read #1 (first observation, immediate)
    expect(h.readHookLog).toHaveBeenCalledTimes(1);

    // a change arrives — within the window the read is deferred, not served
    h.setStat(11, 101);
    h.advance(10);
    await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(1); // still deferred

    // a later tick crosses the window boundary; the trailing read must fire
    // even though the signature has NOT changed this tick.
    h.advance(120);
    await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(2); // trailing flush fired exactly once

    // and only once — a further tick past the window does not re-read.
    h.advance(120);
    await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(2);
  });

  it("a burst of rapid changes coalesces to exactly one extra read (E4)", async () => {
    const h = harness({ debounceMs: 100 });
    h.setStat(10, 100);
    await h.poller.tick();              // read #1
    expect(h.readHookLog).toHaveBeenCalledTimes(1);

    // three rapid changes within the debounce window
    h.setStat(11, 101); h.advance(5); await h.poller.tick();
    h.setStat(12, 102); h.advance(5); await h.poller.tick();
    h.setStat(13, 103); h.advance(5); await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(1); // all deferred so far

    // crossing the window flushes the coalesced read exactly once
    h.advance(120);
    await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(2);

    // a genuine later change still reads (after its own window)
    h.setStat(14, 104); h.advance(5); await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(2); // deferred
    h.advance(120); await h.poller.tick();
    expect(h.readHookLog).toHaveBeenCalledTimes(3);
  });

  it("a steadily-growing file is never starved (E4)", async () => {
    const h = harness({ debounceMs: 100 });
    let size = 10;
    h.setStat(size, size);
    await h.poller.tick(); // read #1
    expect(h.readHookLog).toHaveBeenCalledTimes(1);

    // file grows on every tick; the trailing read must still fire periodically.
    let reads = 1;
    for (let i = 0; i < 30; i++) {
      size += 1;
      h.setStat(size, size);
      h.advance(40); // 40ms ticks, window is 100ms
      await h.poller.tick();
      reads = h.readHookLog.mock.calls.length;
    }
    // 30 ticks * 40ms = 1200ms elapsed; with a 100ms window the trailing read
    // should have fired multiple times — the file is not starved forever.
    expect(reads).toBeGreaterThan(1);
  });

  it("unchanged signature → re-render cache with ZERO reads (E4)", async () => {
    const h = harness({ debounceMs: 100 });
    h.setStat(10, 100);
    await h.poller.tick(); // read #1
    expect(h.readHookLog).toHaveBeenCalledTimes(1);

    // many ticks with no change and no pending read → pure clock refreshes
    for (let i = 0; i < 5; i++) {
      h.advance(200);
      await h.poller.tick();
    }
    expect(h.readHookLog).toHaveBeenCalledTimes(1); // ZERO extra reads
    expect(h.render).toHaveBeenCalledTimes(6);       // re-rendered each tick
  });
});
