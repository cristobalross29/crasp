import { describe, it, expect } from "vitest";
import {
  maskSpan,
  maskSpanInLine,
  detectSecrets,
} from "../../src/core/scanner/secrets.js";

describe("maskSpan", () => {
  it("masks the middle of a span, keeping 4 ends", () => {
    const t = "key=sk-ABCDEFGHIJKLMNOP1234";
    expect(maskSpan(t, 4, t.length - 4)).toMatch(/^sk-A\.\.\.\[REDACTED\]\.\.\.1234$/);
  });

  it("returns [REDACTED] for spans of 8 chars or fewer", () => {
    const t = "key=short";
    expect(maskSpan(t, 4, 5)).toBe("[REDACTED]");
  });

  it("returns [REDACTED] for spans of exactly 8 chars", () => {
    const t = "key=12345678";
    expect(maskSpan(t, 4, 8)).toBe("[REDACTED]");
  });

  it("masks only the extracted span, ignoring surrounding text", () => {
    const t = "prefix sk-ABCDEFGHIJKLMNOP1234 suffix";
    const start = 7;
    const len = 24;
    const result = maskSpan(t, start, len);
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("prefix");
    expect(result).not.toContain("suffix");
  });

  it("masks a span starting at index 0", () => {
    const t = "sk-ABCDEFGHIJKLMNOP1234 rest";
    const result = maskSpan(t, 0, 23);
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("rest");
  });

  it("masks a span at the end of the text", () => {
    const t = "start sk-ABCDEFGHIJKLMNOP1234";
    const len = 23;
    const start = t.length - len;
    const result = maskSpan(t, start, len);
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).not.toContain("start");
  });
});

describe("maskSpanInLine", () => {
  it("masks a span that is fully on the target line", () => {
    const text = "line one\nkey=sk-ABCDEFGHIJKLMNOP1234\nline three";
    const lineStart = "line one\n".length;
    const secretStart = lineStart + 4; // after "key="
    const secretLen = 23; // "sk-ABCDEFGHIJKLMNOP1234"
    const result = maskSpanInLine(text, secretStart, secretLen, 1);
    expect(result).toContain("key=");
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).toContain("[REDACTED]");
    // Should only be the line content, not other lines
    expect(result).not.toContain("line one");
    expect(result).not.toContain("line three");
  });

  it("returns the line with [REDACTED] for short span", () => {
    const text = "first\nABC=short\nthird";
    const lineStart = "first\n".length;
    const secretStart = lineStart + 4; // after "ABC="
    const secretLen = 5; // "short"
    const result = maskSpanInLine(text, secretStart, secretLen, 1);
    expect(result).toContain("ABC=");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("short");
  });

  it("works on the first line (line 0)", () => {
    const text = "sk-ABCDEFGHIJKLMNOP1234\nother";
    const result = maskSpanInLine(text, 0, 23, 0);
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("other");
  });
});

describe("detectSecrets", () => {
  it("returns an empty array (stub)", () => {
    expect(detectSecrets("anything here")).toEqual([]);
  });

  it("returns an empty array for empty string", () => {
    expect(detectSecrets("")).toEqual([]);
  });

  it("accepts optional filePath without error", () => {
    expect(detectSecrets("content", "/some/path.ts")).toEqual([]);
  });
});
