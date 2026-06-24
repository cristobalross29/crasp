import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve("dist/index.js");

describe("policy check — secret redaction", () => {
  it("redacts token-leakage matches and does not print the raw secret", () => {
    const token = "sk-" + "A".repeat(30);
    const result = spawnSync("node", [CLI, "policy", "check", token], {
      encoding: "utf8",
    });

    expect(result.stdout).toContain("[REDACTED]");
    expect(result.stdout).not.toContain(token);
  });
});
