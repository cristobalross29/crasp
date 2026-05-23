import { describe, expect, it } from "vitest";
import { scanContent } from "../../src/core/scanner/index.js";
import { BUILTIN_POLICY } from "../../src/core/patterns/builtin.js";
import { mergeWithBuiltin } from "../../src/core/patterns/index.js";
import type { Policy } from "../../src/types/index.js";

describe("patterns", () => {
  it("ships ten built-in security rules", () => {
    expect(BUILTIN_POLICY.rules).toHaveLength(10);
    expect(BUILTIN_POLICY.rules.map((rule) => rule.id)).toEqual(
      expect.arrayContaining([
        "credential-exfiltration",
        "prompt-injection",
        "ssrf",
        "path-traversal",
        "code-execution",
        "data-exfiltration",
        "pii-exposure",
        "token-leakage",
        "system-prompt-extraction",
        "jailbreak-attempt"
      ])
    );
  });

  it("merges user rules while deduplicating by rule id", () => {
    const policy: Policy = {
      id: "custom",
      name: "Custom",
      rules: [
        {
          id: "credential-exfiltration",
          description: "Duplicate",
          severity: "low",
          pattern: "duplicate"
        },
        {
          id: "custom-rule",
          description: "Custom rule",
          severity: "medium",
          pattern: "custom"
        }
      ]
    };

    const merged = mergeWithBuiltin(policy);

    expect(merged.rules).toHaveLength(11);
    expect(merged.rules.filter((rule) => rule.id === "credential-exfiltration")).toHaveLength(1);
    expect(merged.rules.some((rule) => rule.id === "custom-rule")).toBe(true);
  });

  it("does not treat local dev URLs or empty env placeholders as leaks", () => {
    const result = scanContent(
      [
        "NEXT_PUBLIC_APP_URL=http://localhost:3000",
        "DATABASE_URL=postgres://localhost:5432/app",
        "API_KEY=",
        "SECRET_KEY=your_secret_key_here",
        "apiKey = process.env.OPENAI_API_KEY",
        "ApiKey = normalizeApiKeyCandidate"
      ].join("\n"),
      BUILTIN_POLICY
    );

    expect(result.matches).toHaveLength(0);
  });

  it("detects metadata-service SSRF targets and real-looking token values", () => {
    const result = scanContent(
      [
        "fetch('http://169.254.169.254/latest/meta-data/')",
        "API_KEY=abcd1234abcd1234abcd1234"
      ].join("\n"),
      BUILTIN_POLICY
    );

    expect(result.matches.map((match) => match.ruleId)).toEqual(
      expect.arrayContaining(["ssrf", "token-leakage"])
    );
  });
});
