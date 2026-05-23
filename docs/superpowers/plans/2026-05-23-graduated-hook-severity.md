# Graduated Hook Severity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AgentFence's binary block/warn hook behavior with a three-tier graduated system (advisory / high / critical) and add policy exceptions that bypass all checks silently.

**Architecture:** Each sensitive path rule now carries a `tier` (`advisory | high | critical`) per operation. In `runHookInputCheck`, the policy is loaded first so exceptions can be checked before path rules fire. The tier drives which Claude Code hook output format is used. A new `exceptions.ts` module owns all exception-matching logic using `micromatch`.

**Tech Stack:** TypeScript ESM, tsup, Vitest, micromatch (already installed), Zod v4, js-yaml, Commander.

---

## File Map

| File | Change |
|---|---|
| `src/types/index.ts` | Add `PolicyException` interface; add `exceptions` to `Policy` |
| `src/core/policy/schema.ts` | Add `policyExceptionSchema`; add `exceptions` array to `policySchema` |
| `src/core/policy/exceptions.ts` | **NEW** — `matchesException(filePath, op, exceptions)` using micromatch |
| `src/core/scanner/sensitive-paths.ts` | Replace `"block"/"warn"` with `"advisory"/"high"/"critical"` tier; add formatted messages |
| `src/cli/commands/check.ts` | Load policy before path check; check exceptions first; format output by tier |
| `src/cli/commands/setup.ts` | Update `STARTER_POLICY` string with commented exceptions block |
| `tests/core/policy-exceptions.test.ts` | **NEW** — unit tests for `matchesException` |
| `tests/core/sensitive-paths.test.ts` | Update `action` → `tier`; update tier names |
| `tests/cli/check-hook-input.test.ts` | Update: `"deny"` → `"ask"` for env files; `"deny"` remains for keys; advisory relay format |
| `tests/integration/check-with-exceptions.test.ts` | **NEW** — end-to-end: exception in policy → hook exits 0 silently |

---

## Task 1: Add `PolicyException` to types and policy schema

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/core/policy/schema.ts`

- [ ] **Step 1.1: Write the failing type test (compile-time check)**

In `tests/core/policy-exceptions.test.ts` create this file — it will fail to compile until types exist:

```typescript
import { describe, it, expect } from "vitest";
import type { PolicyException, Policy } from "../../src/types/index.js";

describe("PolicyException type", () => {
  it("accepts a valid exception object", () => {
    const ex: PolicyException = {
      path: ".env.local",
      ops: ["read", "write"],
    };
    expect(ex.path).toBe(".env.local");
  });

  it("accepts optional id and reason", () => {
    const ex: PolicyException = {
      id: "allow-env",
      path: ".env*",
      ops: ["any"],
      reason: "intentional",
    };
    expect(ex.id).toBe("allow-env");
  });

  it("Policy type accepts exceptions array", () => {
    const p: Policy = {
      id: "test",
      name: "Test",
      rules: [],
      exceptions: [{ path: ".env.local", ops: ["read"] }],
    };
    expect(p.exceptions).toHaveLength(1);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
pnpm test tests/core/policy-exceptions.test.ts
```

Expected: compilation error — `PolicyException` not found.

- [ ] **Step 1.3: Add `PolicyException` to `src/types/index.ts`**

Add after the `PolicyRule` interface (around line 36):

```typescript
export type ExceptionOp = "read" | "write" | "edit" | "any";

export interface PolicyException {
  id?: string;
  path: string;
  ops: ExceptionOp[];
  reason?: string;
}
```

Update the `Policy` interface to include exceptions:

```typescript
export interface Policy {
  id: string;
  name: string;
  version?: string;
  rules: PolicyRule[];
  exceptions?: PolicyException[];
}
```

- [ ] **Step 1.4: Add `policyExceptionSchema` to `src/core/policy/schema.ts`**

Replace entire file content:

```typescript
import { z } from "zod";
import { severitySchema, targetRoleSchema } from "../scenario/schema.js";

export const policyRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  severity: severitySchema.default("medium"),
  pattern: z.string().min(1),
  target: targetRoleSchema.default("assistant"),
  message: z.string().optional()
});

export const policyExceptionSchema = z.object({
  id: z.string().optional(),
  path: z.string().min(1),
  ops: z.array(z.enum(["read", "write", "edit", "any"])).default(["any"]),
  reason: z.string().optional(),
});

export const policySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().optional(),
  rules: z.array(policyRuleSchema).default([]),
  exceptions: z.array(policyExceptionSchema).default([]),
});

export type ParsedPolicy = z.infer<typeof policySchema>;
```

- [ ] **Step 1.5: Run test to verify it passes**

```bash
pnpm test tests/core/policy-exceptions.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 1.6: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 1.7: Commit**

```bash
git add src/types/index.ts src/core/policy/schema.ts tests/core/policy-exceptions.test.ts
git commit -m "feat(types): add PolicyException interface and exceptions to policy schema"
```

---

## Task 2: Create exception matching module

**Files:**
- Create: `src/core/policy/exceptions.ts`
- Modify: `tests/core/policy-exceptions.test.ts` (add matching tests)

- [ ] **Step 2.1: Add matching tests to `tests/core/policy-exceptions.test.ts`**

Append these `describe` blocks to the existing file:

```typescript
import { matchesException } from "../../src/core/policy/exceptions.js";
import type { PolicyException } from "../../src/types/index.js";

describe("matchesException", () => {
  describe("exact path matching", () => {
    it("matches exact basename", () => {
      const ex: PolicyException = { path: ".env.local", ops: ["write"] };
      expect(matchesException("/project/.env.local", "Write", [ex])).toBe(true);
    });

    it("does not match a different file", () => {
      const ex: PolicyException = { path: ".env.local", ops: ["write"] };
      expect(matchesException("/project/.env.production", "Write", [ex])).toBe(false);
    });
  });

  describe("glob matching", () => {
    it("matches .env* glob against .env.local", () => {
      const ex: PolicyException = { path: ".env*", ops: ["read"] };
      expect(matchesException("/project/.env.local", "Read", [ex])).toBe(true);
    });

    it("matches *.pem glob against server.pem", () => {
      const ex: PolicyException = { path: "*.pem", ops: ["any"] };
      expect(matchesException("/certs/server.pem", "Write", [ex])).toBe(true);
    });

    it("does not match .env* against a non-env file", () => {
      const ex: PolicyException = { path: ".env*", ops: ["read"] };
      expect(matchesException("/project/config.ts", "Read", [ex])).toBe(false);
    });
  });

  describe("op matching", () => {
    it("matches when op is in the ops list", () => {
      const ex: PolicyException = { path: ".env.local", ops: ["read", "write"] };
      expect(matchesException("/project/.env.local", "Write", [ex])).toBe(true);
      expect(matchesException("/project/.env.local", "Read", [ex])).toBe(true);
    });

    it("does not match when op is not in ops list", () => {
      const ex: PolicyException = { path: ".env.local", ops: ["read"] };
      expect(matchesException("/project/.env.local", "Write", [ex])).toBe(false);
    });

    it("ops: ['any'] matches all operations", () => {
      const ex: PolicyException = { path: ".env.local", ops: ["any"] };
      expect(matchesException("/project/.env.local", "Write", [ex])).toBe(true);
      expect(matchesException("/project/.env.local", "Edit", [ex])).toBe(true);
      expect(matchesException("/project/.env.local", "Read", [ex])).toBe(true);
    });

    it("default ops (empty array parsed to ['any']) matches all", () => {
      // When no ops provided, policyExceptionSchema defaults to ["any"]
      const ex: PolicyException = { path: ".env.local", ops: ["any"] };
      expect(matchesException("/project/.env.local", "Edit", [ex])).toBe(true);
    });
  });

  describe("multiple exceptions", () => {
    it("returns true if any exception matches", () => {
      const exceptions: PolicyException[] = [
        { path: "*.pem", ops: ["read"] },
        { path: ".env.local", ops: ["write"] },
      ];
      expect(matchesException("/project/.env.local", "Write", exceptions)).toBe(true);
    });

    it("returns false when no exception matches", () => {
      const exceptions: PolicyException[] = [
        { path: ".env.example", ops: ["any"] },
      ];
      expect(matchesException("/project/.env.local", "Write", exceptions)).toBe(false);
    });

    it("returns false for empty exceptions array", () => {
      expect(matchesException("/project/.env.local", "Write", [])).toBe(false);
    });
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
pnpm test tests/core/policy-exceptions.test.ts
```

Expected: FAIL — `matchesException` not found.

- [ ] **Step 2.3: Create `src/core/policy/exceptions.ts`**

```typescript
import micromatch from "micromatch";
import path from "node:path";
import type { PolicyException, ExceptionOp } from "../../types/index.js";
import type { HookTool } from "../scanner/sensitive-paths.js";

const OP_MAP: Record<HookTool, ExceptionOp> = {
  Write: "write",
  Edit: "edit",
  Read: "read",
};

export function matchesException(
  filePath: string,
  op: HookTool,
  exceptions: PolicyException[]
): boolean {
  if (!filePath || exceptions.length === 0) return false;

  const basename = path.basename(filePath);
  const normalizedOp = OP_MAP[op];

  return exceptions.some((ex) => {
    const pathMatches = micromatch.isMatch(basename, ex.path);
    if (!pathMatches) return false;

    const opsToCheck = ex.ops.length === 0 ? (["any"] as ExceptionOp[]) : ex.ops;
    return opsToCheck.includes("any") || opsToCheck.includes(normalizedOp);
  });
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
pnpm test tests/core/policy-exceptions.test.ts
```

Expected: all tests pass (3 type tests + ~12 matching tests).

- [ ] **Step 2.5: Build and typecheck**

```bash
pnpm build && pnpm typecheck
```

Expected: clean.

- [ ] **Step 2.6: Commit**

```bash
git add src/core/policy/exceptions.ts tests/core/policy-exceptions.test.ts
git commit -m "feat(policy): add exception matching module with micromatch glob support"
```

---

## Task 3: Rewrite sensitive-paths with tiers

**Files:**
- Modify: `src/core/scanner/sensitive-paths.ts`
- Modify: `tests/core/sensitive-paths.test.ts`

The goal is to replace `action: "block" | "warn"` with `tier: "advisory" | "high" | "critical"` and add human-readable formatted messages appropriate for each tier.

- [ ] **Step 3.1: Rewrite `tests/core/sensitive-paths.test.ts` for new API**

Replace entire file content:

```typescript
import { describe, expect, it } from "vitest";
import { checkSensitivePath } from "../../src/core/scanner/sensitive-paths.js";

describe("checkSensitivePath", () => {
  describe(".env files — write/edit → high tier", () => {
    it("returns high tier when writing to .env", () => {
      const result = checkSensitivePath("/project/.env", "Write");
      expect(result?.tier).toBe("high");
      expect(result?.ruleId).toBe("sensitive-env-file");
      expect(result?.message).toContain(".env");
      expect(result?.message).toContain("⚠️");
    });

    it("returns high tier when writing to .env.local", () => {
      const result = checkSensitivePath("/project/.env.local", "Write");
      expect(result?.tier).toBe("high");
    });

    it("returns high tier when editing .env.production.local", () => {
      const result = checkSensitivePath("/project/.env.production.local", "Edit");
      expect(result?.tier).toBe("high");
    });

    it("returns high tier when editing .env.local", () => {
      const result = checkSensitivePath("/project/.env.local", "Edit");
      expect(result?.tier).toBe("high");
    });
  });

  describe(".env files — read → advisory tier", () => {
    it("returns advisory tier when reading .env.local", () => {
      const result = checkSensitivePath("/project/.env.local", "Read");
      expect(result?.tier).toBe("advisory");
      expect(result?.ruleId).toBe("sensitive-env-file");
      expect(result?.message).toContain(".env.local");
    });
  });

  describe(".env templates — always null (no action)", () => {
    it("returns null for .env.example (Write)", () => {
      expect(checkSensitivePath("/project/.env.example", "Write")).toBeNull();
    });

    it("returns null for .env.sample (Read)", () => {
      expect(checkSensitivePath("/project/.env.sample", "Read")).toBeNull();
    });

    it("returns null for .env.template (Write)", () => {
      expect(checkSensitivePath("/project/.env.template", "Write")).toBeNull();
    });

    it("returns null for .env.dist (Edit)", () => {
      expect(checkSensitivePath("/project/.env.dist", "Edit")).toBeNull();
    });
  });

  describe("cryptographic key files — always critical tier", () => {
    it("returns critical tier for writing a .pem file", () => {
      const result = checkSensitivePath("/certs/server.pem", "Write");
      expect(result?.tier).toBe("critical");
      expect(result?.ruleId).toBe("sensitive-key-file");
      expect(result?.message).toContain("🚨");
      expect(result?.message).toContain("server.pem");
    });

    it("returns critical tier for reading a .pem file", () => {
      const result = checkSensitivePath("/certs/server.pem", "Read");
      expect(result?.tier).toBe("critical");
    });

    it("returns critical tier for a .key file", () => {
      expect(checkSensitivePath("/certs/server.key", "Write")?.tier).toBe("critical");
    });

    it("returns critical tier for id_rsa", () => {
      expect(checkSensitivePath("/home/user/.ssh/id_rsa", "Write")?.tier).toBe("critical");
    });

    it("returns critical tier for id_ed25519", () => {
      expect(checkSensitivePath("/home/user/.ssh/id_ed25519", "Edit")?.tier).toBe("critical");
    });

    it("returns critical tier for a .p12 file", () => {
      expect(checkSensitivePath("/certs/client.p12", "Write")?.tier).toBe("critical");
    });
  });

  describe("cloud credentials", () => {
    it("returns high tier when writing to .aws/credentials", () => {
      const result = checkSensitivePath("/home/user/.aws/credentials", "Write");
      expect(result?.tier).toBe("high");
      expect(result?.ruleId).toBe("sensitive-cloud-credentials");
    });

    it("returns advisory tier when reading .aws/credentials", () => {
      const result = checkSensitivePath("/home/user/.aws/credentials", "Read");
      expect(result?.tier).toBe("advisory");
    });
  });

  describe("safe files — always null", () => {
    it("returns null for normal source files", () => {
      expect(checkSensitivePath("/project/src/index.ts", "Write")).toBeNull();
      expect(checkSensitivePath("/project/README.md", "Edit")).toBeNull();
      expect(checkSensitivePath("/project/package.json", "Read")).toBeNull();
    });

    it("returns null for empty path", () => {
      expect(checkSensitivePath("", "Write")).toBeNull();
    });
  });
});
```

- [ ] **Step 3.2: Run tests to see them fail**

```bash
pnpm test tests/core/sensitive-paths.test.ts
```

Expected: most tests fail — `tier` not found, wrong values.

- [ ] **Step 3.3: Rewrite `src/core/scanner/sensitive-paths.ts`**

Replace entire file:

```typescript
import path from "node:path";

export type SensitivePathTier = "advisory" | "high" | "critical";

export interface SensitivePathResult {
  tier: SensitivePathTier;
  ruleId: string;
  message: string;
}

export type HookTool = "Write" | "Edit" | "Read";

interface SensitivePathRule {
  test: (basename: string, fullPath: string) => boolean;
  writeTier: SensitivePathTier;
  readTier: SensitivePathTier;
  ruleId: string;
  buildWriteMessage: (basename: string) => string;
  buildReadMessage: (basename: string) => string;
}

const ENV_TEMPLATE_SUFFIXES = /\.(example|sample|template|dist)$/i;

const SENSITIVE_PATH_RULES: SensitivePathRule[] = [
  {
    test: (name) =>
      /^\.env(\.[^/\\]+)?$/.test(name) && !ENV_TEMPLATE_SUFFIXES.test(name),
    writeTier: "high",
    readTier: "advisory",
    ruleId: "sensitive-env-file",
    buildWriteMessage: (name) =>
      `⚠️  AgentFence Warning\n\n` +
      `Writing to ${name} — this file likely contains API keys and secrets.\n` +
      `Accidentally modifying it could expose credentials or break your app.\n\n` +
      `To pre-approve this, add to agentfence.policy.yml:\n` +
      `  exceptions:\n` +
      `    - path: "${name}"\n` +
      `      ops: [write, edit]`,
    buildReadMessage: (name) =>
      `AgentFence: You are reading ${name}, which may contain secrets (API keys, ` +
      `passwords, tokens). Please tell the user: "AgentFence noticed I'm reading a ` +
      `sensitive file — I'll make sure not to include any secret values in my response."`,
  },
  {
    test: (name) =>
      /\.(pem|key|p12|pfx|jks)$/i.test(name) ||
      /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(name),
    writeTier: "critical",
    readTier: "critical",
    ruleId: "sensitive-key-file",
    buildWriteMessage: (name) =>
      `🚨  AgentFence — Critical Security Risk\n\n` +
      `Writing to ${name} — this is a cryptographic private key or certificate.\n` +
      `Modifying this file could compromise your server's identity and all SSL connections.\n\n` +
      `This is a HIGH RISK action. Only proceed if you are certain.\n\n` +
      `To pre-approve this, add to agentfence.policy.yml:\n` +
      `  exceptions:\n` +
      `    - path: "${name}"\n` +
      `      ops: [write, edit]`,
    buildReadMessage: (name) =>
      `🚨  AgentFence — Critical Security Risk\n\n` +
      `Reading ${name} — this is a cryptographic private key or certificate.\n` +
      `Exposing the contents of this file could compromise your server.\n\n` +
      `To pre-approve this, add to agentfence.policy.yml:\n` +
      `  exceptions:\n` +
      `    - path: "${name}"\n` +
      `      ops: [read]`,
  },
  {
    test: (_name, fullPath) =>
      /[/\\]\.aws[/\\]credentials$/i.test(fullPath) ||
      /[/\\]\.gcloud[/\\]credentials\.db$/i.test(fullPath),
    writeTier: "high",
    readTier: "advisory",
    ruleId: "sensitive-cloud-credentials",
    buildWriteMessage: (name) =>
      `⚠️  AgentFence Warning\n\n` +
      `Writing to ${name} — this file contains cloud provider credentials.\n` +
      `Modifying it could lock you out of your cloud account or expose access keys.\n\n` +
      `To pre-approve this, add to agentfence.policy.yml:\n` +
      `  exceptions:\n` +
      `    - path: "${name}"\n` +
      `      ops: [write, edit]`,
    buildReadMessage: (name) =>
      `AgentFence: You are reading ${name}, which contains cloud provider credentials. ` +
      `Please tell the user: "AgentFence noticed I'm reading a cloud credentials file — ` +
      `I'll make sure not to include any credential values in my response."`,
  },
];

export function checkSensitivePath(
  filePath: string,
  op: HookTool
): SensitivePathResult | null {
  if (!filePath) return null;

  const basename = path.basename(filePath);

  for (const rule of SENSITIVE_PATH_RULES) {
    if (!rule.test(basename, filePath)) continue;

    const tier = op === "Read" ? rule.readTier : rule.writeTier;
    const message =
      op === "Read"
        ? rule.buildReadMessage(basename)
        : rule.buildWriteMessage(basename);

    return { tier, ruleId: rule.ruleId, message };
  }

  return null;
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
pnpm test tests/core/sensitive-paths.test.ts
```

Expected: all 19 tests pass.

- [ ] **Step 3.5: Build and typecheck**

```bash
pnpm build && pnpm typecheck
```

Expected: clean. Note: `check.ts` will still compile because `SensitivePathResult` still exports `tier`, `ruleId`, and `message`.

- [ ] **Step 3.6: Commit**

```bash
git add src/core/scanner/sensitive-paths.ts tests/core/sensitive-paths.test.ts
git commit -m "feat(sensitive-paths): replace block/warn with advisory/high/critical tiers"
```

---

## Task 4: Update `check.ts` — wire exceptions + tier-based output

**Files:**
- Modify: `src/cli/commands/check.ts`
- Modify: `tests/cli/check-hook-input.test.ts`

This is the core wiring task. `runHookInputCheck` now: loads policy → checks exceptions → checks sensitive path → checks content. The tier drives the hook output format.

- [ ] **Step 4.1: Rewrite `tests/cli/check-hook-input.test.ts`**

Replace entire file:

```typescript
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve("dist/index.js");

function makePayload(toolInput: Record<string, unknown>): string {
  return JSON.stringify({ tool_input: toolInput });
}

type HookOutput = {
  hookSpecificOutput?: {
    hookEventName?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
};

function parseOutput(stdout: string): HookOutput {
  try {
    return JSON.parse(stdout.trim()) as HookOutput;
  } catch {
    return {};
  }
}

function isAsk(stdout: string): boolean {
  const out = parseOutput(stdout).hookSpecificOutput ?? {};
  return out.permissionDecision === "ask";
}

function isDeny(stdout: string): boolean {
  const out = parseOutput(stdout).hookSpecificOutput ?? {};
  return out.permissionDecision === "deny";
}

function isAdvisory(stdout: string): boolean {
  const out = parseOutput(stdout).hookSpecificOutput ?? {};
  return typeof out.additionalContext === "string" && out.additionalContext.length > 0;
}

describe("check --hook-input Write — env files (high tier → ask)", () => {
  it("outputs ask for writing to .env.local", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/.env.local", content: "X=1" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(isAsk(result.stdout)).toBe(true);
    const out = parseOutput(result.stdout).hookSpecificOutput!;
    expect(out.permissionDecisionReason).toContain("⚠️");
    expect(out.permissionDecisionReason).toContain(".env.local");
    expect(out.permissionDecisionReason).toContain("agentfence.policy.yml");
  });

  it("outputs ask for writing to .env", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/.env", content: "X=1" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(isAsk(result.stdout)).toBe(true);
  });

  it("allows .env.example with no output", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/.env.example", content: "X=your-key" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("check --hook-input Edit — env files (high tier → ask)", () => {
  it("outputs ask for editing .env.local", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Edit"], {
      input: makePayload({
        file_path: "/project/.env.local",
        old_string: "X=1",
        new_string: "X=2",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(isAsk(result.stdout)).toBe(true);
  });
});

describe("check --hook-input Read — env files (advisory tier)", () => {
  it("outputs advisory context when reading .env.local", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Read"], {
      input: makePayload({ file_path: "/project/.env.local" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(isAdvisory(result.stdout)).toBe(true);
    const ctx = parseOutput(result.stdout).hookSpecificOutput!.additionalContext!;
    expect(ctx).toContain(".env.local");
    expect(ctx).toContain("AgentFence");
    // Advisory must NOT be a deny or ask — tool should proceed
    expect(isDeny(result.stdout)).toBe(false);
    expect(isAsk(result.stdout)).toBe(false);
  });
});

describe("check --hook-input — key files (critical tier → ask)", () => {
  it("outputs ask with critical message for writing a .pem file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/certs/server.pem", content: "---BEGIN---" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(isAsk(result.stdout)).toBe(true);
    const reason = parseOutput(result.stdout).hookSpecificOutput!.permissionDecisionReason!;
    expect(reason).toContain("🚨");
    expect(reason).toContain("server.pem");
  });

  it("outputs ask with critical message for reading a .pem file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Read"], {
      input: makePayload({ file_path: "/certs/server.pem" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(isAsk(result.stdout)).toBe(true);
  });

  it("outputs ask for id_rsa", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/home/.ssh/id_rsa", content: "---" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(isAsk(result.stdout)).toBe(true);
  });
});

describe("check --hook-input — content policy violations", () => {
  it("outputs ask (deny) when written content leaks an API token", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({
        file_path: "/project/config.ts",
        content: "const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    // Content policy violations always deny (not ask) — the file path is safe
    expect(isDeny(result.stdout)).toBe(true);
    const reason = parseOutput(result.stdout).hookSpecificOutput!.permissionDecisionReason!;
    expect(reason).toContain("token-leakage");
  });

  it("outputs ask (deny) when new_string contains a leaked token", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Edit"], {
      input: makePayload({
        file_path: "/project/config.ts",
        old_string: "const key = '';",
        new_string: "const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(isDeny(result.stdout)).toBe(true);
  });
});

describe("check --hook-input — clean operations", () => {
  it("exits 0 with no output for a clean write to a safe file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/src/index.ts", content: "export const x = 1;" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("exits 0 with no output for a clean read of a safe file", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Read"], {
      input: makePayload({ file_path: "/project/src/utils.ts" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("check --hook-input — policy exceptions bypass", () => {
  let tempDir: string;

  async function setup(policyYml: string): Promise<string> {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "af-exc-"));
    await writeFile(path.join(tempDir, "agentfence.policy.yml"), policyYml);
    return tempDir;
  }

  async function cleanup(): Promise<void> {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }

  it("exits 0 silently when exception matches Write to .env.local", async () => {
    const dir = await setup(`
id: test
name: Test
rules: []
exceptions:
  - path: ".env.local"
    ops: [write, edit]
`);
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/.env.local", content: "X=1" }),
      encoding: "utf8",
      cwd: dir,
    });
    await cleanup();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("still asks when exception covers only read but op is write", async () => {
    const dir = await setup(`
id: test
name: Test
rules: []
exceptions:
  - path: ".env.local"
    ops: [read]
`);
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: makePayload({ file_path: "/project/.env.local", content: "X=1" }),
      encoding: "utf8",
      cwd: dir,
    });
    await cleanup();
    expect(result.status).toBe(0);
    expect(isAsk(result.stdout)).toBe(true);
  });

  it("exits 0 silently when exception uses glob .env* and op is edit", async () => {
    const dir = await setup(`
id: test
name: Test
rules: []
exceptions:
  - path: ".env*"
    ops: [any]
`);
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Edit"], {
      input: makePayload({
        file_path: "/project/.env.production",
        old_string: "X=1",
        new_string: "X=2",
      }),
      encoding: "utf8",
      cwd: dir,
    });
    await cleanup();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("check --hook-input — edge cases", () => {
  it("exits 0 for malformed JSON payload (fail open)", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: "not valid json",
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });

  it("exits 0 when payload has no file_path", () => {
    const result = spawnSync("node", [CLI, "check", "--hook-input", "Write"], {
      input: JSON.stringify({ tool_input: { content: "export const x = 1;" } }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
  });
});
```

- [ ] **Step 4.2: Run tests to see them fail**

```bash
pnpm test tests/cli/check-hook-input.test.ts
```

Expected: failures on ask/advisory distinctions and exception tests — `checkSensitivePath` still returns old shape from the compiled dist.

- [ ] **Step 4.3: Rewrite `runHookInputCheck` in `src/cli/commands/check.ts`**

Replace only the `runHookInputCheck` function (lines 149–221):

```typescript
async function runHookInputCheck(toolName: HookTool): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    process.exit(0);
  }

  const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>;
  const filePath = (toolInput.file_path as string | undefined) ?? "";

  // 1. Load policy (needed for both exception check and content scan)
  const policy = await loadMergedPolicy();

  // 2. Check exceptions first — pre-approved paths exit silently
  if (matchesException(filePath, toolName, policy.exceptions ?? [])) {
    process.exit(0);
  }

  // 3. Sensitive file path check — tier drives the hook output format
  const pathResult = checkSensitivePath(filePath, toolName);
  if (pathResult) {
    if (pathResult.tier === "advisory") {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            additionalContext: pathResult.message,
          },
        })
      );
    } else {
      // "high" or "critical" → ask dialog with formatted reason
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: pathResult.message,
          },
        })
      );
    }
    process.exit(0);
  }

  // 4. Content policy check (Write and Edit only)
  let content = "";
  if (toolName === "Write") content = (toolInput.content as string | undefined) ?? "";
  else if (toolName === "Edit") content = (toolInput.new_string as string | undefined) ?? "";

  if (content) {
    const scanResult = scanContent(content, policy);
    const blocking = scanResult.matches.filter(
      (m) => m.severity === "high" || m.severity === "critical"
    );
    if (blocking.length > 0) {
      const reasons = blocking
        .map((m) => `${m.ruleId} (${m.severity}): ${m.match}`)
        .join("; ");
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `[agentfence] content policy violation — ${reasons}`,
          },
        })
      );
    }
  }

  process.exit(0);
}
```

Also add the import for `matchesException` at the top of the file with the other imports:

```typescript
import { matchesException } from "../../core/policy/exceptions.js";
```

- [ ] **Step 4.4: Build**

```bash
pnpm build
```

Expected: clean build.

- [ ] **Step 4.5: Run the hook-input tests**

```bash
pnpm test tests/cli/check-hook-input.test.ts
```

Expected: all tests pass.

- [ ] **Step 4.6: Run all tests**

```bash
pnpm test
```

Expected: all 98+ tests pass. If `check-hook-input` introduced new tests, count will be higher.

- [ ] **Step 4.7: Typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4.8: Commit**

```bash
git add src/cli/commands/check.ts tests/cli/check-hook-input.test.ts
git commit -m "feat(check): wire exceptions + tier-based hook output in runHookInputCheck"
```

---

## Task 5: Update starter policy with commented exceptions block

**Files:**
- Modify: `src/cli/commands/setup.ts`
- Modify: `tests/integration/setup.test.ts`

- [ ] **Step 5.1: Add a test for the exceptions block in the starter policy**

In `tests/integration/setup.test.ts`, add one test inside the existing `describe("setupCommand")` block:

```typescript
it("starter policy includes a commented exceptions example block", async () => {
  const freshRoot = await mkdtemp(path.join(os.tmpdir(), "af-policy-exc-"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  process.chdir(freshRoot);
  try {
    await setupCommand();
    const policy = await readFile(path.join(freshRoot, "agentfence.policy.yml"), "utf8");
    expect(policy).toContain("exceptions:");
    expect(policy).toContain("ops:");
  } finally {
    process.chdir(originalCwd);
    await rm(freshRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
pnpm test tests/integration/setup.test.ts
```

Expected: new test fails — starter policy has no exceptions block yet.

- [ ] **Step 5.3: Update `STARTER_POLICY` in `src/cli/commands/setup.ts`**

Replace the `STARTER_POLICY` constant (around lines 17–27):

```typescript
const STARTER_POLICY = `id: default-safety
name: Default Safety Policy
version: 0.1.0
rules:
  - id: credential-theft
    description: Assistant must not provide credential theft or exfiltration instructions.
    severity: critical
    target: assistant
    pattern: "steal (browser )?passwords?|credential theft|dump (chrome|firefox|browser|saved) (login|credential|password)|exfiltrat(e|ing) (credentials?|tokens?|cookies?|passwords?|secrets?)|extract (saved|stored|browser) (credentials?|passwords?|tokens?|logins?)|harvest (credentials?|passwords?|auth tokens?)"
    message: "Credential theft guidance detected."

# Exceptions: pre-approve specific file access to bypass the ask dialog.
# AgentFence will prompt you before Claude touches sensitive files by default.
# Uncomment and edit entries below to allow access without a prompt.
#
# exceptions:
#   - path: ".env.local"
#     ops: [read]
#     reason: "Claude needs to read config for setup tasks"
#   - path: ".env.local"
#     ops: [write, edit]
#     reason: "I manage .env.local directly with Claude"
#   - path: "*.pem"
#     ops: [read]
#     reason: "Reading certs is needed for TLS debugging"
`;
```

- [ ] **Step 5.4: Run setup tests**

```bash
pnpm test tests/integration/setup.test.ts
```

Expected: all tests pass including the new exceptions block test.

- [ ] **Step 5.5: Run all tests**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 5.6: Commit**

```bash
git add src/cli/commands/setup.ts tests/integration/setup.test.ts
git commit -m "feat(setup): add commented exceptions block to starter policy"
```

---

## Task 6: Re-run setup in pagina_personal to activate new hooks

The binary in `pagina_personal` still has the old behavior. Running `agentfence setup --force` there updates the `.claude/settings.json` hooks AND rewrites `agentfence.policy.yml` with the new exceptions template.

- [ ] **Step 6.1: Final build + full test run**

```bash
pnpm build && pnpm test && pnpm typecheck
```

Expected: all pass, no errors.

- [ ] **Step 6.2: Commit everything not yet committed**

```bash
git status
```

If anything is uncommitted, add and commit it.

- [ ] **Step 6.3: Remind user to re-run setup in pagina_personal**

The user needs to run this in their terminal (cannot be done by AgentFence due to self-modification guard):

```bash
cd ~/Desktop/Projects/pagina_personal
agentfence setup --force
```

This will:
- Overwrite `agentfence.policy.yml` with the new commented exceptions template
- The `.claude/settings.json` hooks are already correct from the previous setup run

After that, reading `.env.local` will show an advisory (Claude relays it), writing `.env.local` will show a ⚠️ ask dialog, and writing `id_rsa` will show a 🚨 critical ask dialog.

---

## Self-Review

**Spec coverage check:**
- ✅ Three tiers (advisory / high / critical) — Task 3
- ✅ Advisory: `additionalContext` with relay instruction — Task 3 + 4
- ✅ High: `permissionDecision: "ask"` with ⚠️ — Task 3 + 4
- ✅ Critical: `permissionDecision: "ask"` with 🚨 — Task 3 + 4
- ✅ Policy exceptions — Task 1 + 2
- ✅ Exceptions checked before path rules — Task 4
- ✅ micromatch glob matching — Task 2
- ✅ Starter policy with commented exceptions template — Task 5
- ✅ All exceptions overridable (nothing is `deny` for path rules) — Task 4
- ✅ Content policy violations stay `deny` (no user bypass for leaked tokens) — Task 4

**Placeholder scan:** No TBDs or "similar to above" entries. All code blocks are complete.

**Type consistency:**
- `SensitivePathTier` defined in Task 3, used in Task 4 ✅
- `PolicyException` defined in Task 1, used in Task 2 ✅
- `matchesException(filePath, op, exceptions)` defined in Task 2, imported in Task 4 ✅
- `policy.exceptions` — `Policy` updated in Task 1, `loadMergedPolicy()` returns `Policy` which now includes `exceptions` ✅
- `HookTool` exported from `sensitive-paths.ts`, imported in `exceptions.ts` ✅
