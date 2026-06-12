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
