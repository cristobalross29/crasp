import { describe, it, expect } from "vitest";
import { computeAction } from "../../src/mcp/action.js";
import type { FileScanMatch } from "../../src/types/index.js";

function makeMatch(
  severity: "low" | "medium" | "high" | "critical"
): FileScanMatch {
  return {
    ruleId: "test-rule",
    ruleName: "Test Rule",
    severity,
    line: 1,
    column: 1,
    match: "test",
    context: "test context",
  };
}

describe("computeAction", () => {
  it("returns allow when there are no matches", () => {
    expect(computeAction([])).toBe("allow");
  });

  it("returns warn for a low severity match", () => {
    expect(computeAction([makeMatch("low")])).toBe("warn");
  });

  it("returns warn for a medium severity match", () => {
    expect(computeAction([makeMatch("medium")])).toBe("warn");
  });

  it("returns block for a high severity match", () => {
    expect(computeAction([makeMatch("high")])).toBe("block");
  });

  it("returns block for a critical severity match", () => {
    expect(computeAction([makeMatch("critical")])).toBe("block");
  });

  it("returns block when mix contains critical alongside low", () => {
    expect(
      computeAction([makeMatch("low"), makeMatch("critical")])
    ).toBe("block");
  });

  it("returns block when mix contains high alongside medium", () => {
    expect(
      computeAction([makeMatch("medium"), makeMatch("high")])
    ).toBe("block");
  });
});
