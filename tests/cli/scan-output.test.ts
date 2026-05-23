import { afterEach, describe, expect, it, vi } from "vitest";
import {
  printTerminalScanResults,
  redactSensitiveScanResults
} from "../../src/cli/scan-output.js";
import type { FileScanResult } from "../../src/types/index.js";

describe("printTerminalScanResults", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("limits and truncates terminal output for large match sets", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const hugeMatch = `secret_key=${"x".repeat(10_000)}`;
    const results: FileScanResult[] = Array.from({ length: 101 }, (_, index) => ({
      filePath: `/tmp/project/${index}/deep/path/file-${index}.ts`,
      matches: [
        {
          ruleId: "token-leakage",
          ruleName: "Token leakage",
          severity: "critical",
          line: index + 1,
          column: 1,
          match: hugeMatch,
          context: hugeMatch
        }
      ],
      scanned: true
    }));

    printTerminalScanResults(results, {
      emptyMessage: (scannedFiles) => `Scanned ${scannedFiles}`,
      foundMessage: (totalMatches, matchedFiles) =>
        `Found ${totalMatches} matches in ${matchedFiles} files.`
    });

    const output = log.mock.calls.flat().join("\n");

    expect(output).toContain("Found 101 matches in 101 files.");
    expect(output).toContain("Showing first 50 matches");
    expect(output).not.toContain("x".repeat(100));
    expect(output.length).toBeLessThan(30_000);
  });

  it("redacts token matches in structured output", () => {
    const secret = "API_KEY=abcd1234abcd1234abcd1234";
    const results: FileScanResult[] = [
      {
        filePath: "/tmp/.env.local",
        matches: [
          {
            ruleId: "token-leakage",
            ruleName: "Token leakage",
            severity: "critical",
            line: 1,
            column: 1,
            match: secret,
            context: secret
          }
        ],
        scanned: true
      }
    ];

    const redacted = redactSensitiveScanResults(results);

    expect(redacted[0].matches[0].match).toContain("[REDACTED]");
    expect(redacted[0].matches[0].match).not.toContain("abcd1234abcd1234");
    expect(redacted[0].matches[0].context).toContain("[REDACTED]");
  });
});
