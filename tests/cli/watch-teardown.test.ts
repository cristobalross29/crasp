import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveInterval, wireTeardown } from "../../src/cli/commands/watch.js";

describe("resolveInterval (E9)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the default when no interval is given", () => {
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(resolveInterval(undefined)).toBe(250);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns and falls back to the default for non-numeric / 0 / negative input", () => {
    for (const bad of ["abc", "0", "-5", "NaN"]) {
      const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const result = resolveInterval(bad);
      expect(result).toBe(250);                    // falls back to default
      expect(result).toBeGreaterThanOrEqual(50);   // never below the floor
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain("invalid --interval");
      warn.mockRestore();
    }
  });

  it("floors a too-small but valid interval at 50ms without warning", () => {
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(resolveInterval("10")).toBe(50);
    expect(resolveInterval("1")).toBe(50);
    expect(resolveInterval("500")).toBe(500);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("wireTeardown idempotency (E5)", () => {
  afterEach(() => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
    // leave a single no-op "exit" handler off — remove the ones we added
    process.removeAllListeners("exit");
    vi.restoreAllMocks();
  });

  it("clears the timer exactly once across SIGINT then SIGTERM", () => {
    const fakeTimer = setInterval(() => {}, 1_000_000);
    const clearSpy = vi.spyOn(global, "clearInterval");
    // process.exit must NOT actually terminate the test runner
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => undefined as never));
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const cleanup = wireTeardown(() => fakeTimer);

    process.emit("SIGINT");
    process.emit("SIGTERM");

    // both handlers ran process.exit, but cleanup's guard ran clearInterval once
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledWith(fakeTimer);
    expect(exitSpy).toHaveBeenCalled();

    // a direct extra cleanup call is also a no-op (idempotent)
    cleanup();
    expect(clearSpy).toHaveBeenCalledTimes(1);

    clearInterval(fakeTimer);
  });
});
