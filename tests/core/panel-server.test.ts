import { describe, expect, it } from "vitest";
import { parseSince, isNotFound } from "../../src/core/panel/server.js";

describe("parseSince", () => {
  it("returns null for missing or unparseable input", () => {
    expect(parseSince(null)).toBeNull();
    expect(parseSince("")).toBeNull();
    expect(parseSince("banana")).toBeNull();
  });

  it("compares by instant, not lexically (offset-form ISO)", () => {
    // "2026-07-12T01:30:00+05:00" is the instant 2026-07-11T20:30:00Z, which
    // sorts lexically AFTER "2026-07-12T00:00:00Z" but is chronologically
    // BEFORE it — a lexical comparison would get this backwards.
    const offset = parseSince("2026-07-12T01:30:00+05:00")!;
    const zulu = parseSince("2026-07-12T00:00:00Z")!;
    expect(offset).toBeLessThan(zulu);
    expect(offset).toBe(Date.parse("2026-07-11T20:30:00Z"));
  });
});

describe("isNotFound", () => {
  it("is true only for ENOENT/ENOTDIR, not permission or unknown errors", () => {
    expect(isNotFound({ code: "ENOENT" })).toBe(true);
    expect(isNotFound({ code: "ENOTDIR" })).toBe(true);
    expect(isNotFound({ code: "EACCES" })).toBe(false);
    expect(isNotFound({ code: "EPERM" })).toBe(false);
    expect(isNotFound(new Error("no code"))).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });
});
