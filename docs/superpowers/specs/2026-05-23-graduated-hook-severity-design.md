# AgentFence: Graduated Hook Severity Design

**Date:** 2026-05-23  
**Status:** Approved — ready for implementation

---

## Problem

AgentFence's current PreToolUse hooks either hard-block (deny) or silently advise. This creates two failure modes:

1. Hard blocks feel like a cage — developers can't authorize legitimate AI access to their own files.
2. Silent advisories are invisible to the developer — they only reach Claude's context, not the user's screen.

The original `.env.local` test case showed both failures at once: the block used the wrong exit code protocol (exit 1 instead of `permissionDecision: "deny"`), so the write went through unblocked.

---

## Design

### Core Philosophy

AgentFence is an advisor, not a gatekeeper. Developers always have the final word. The tool's job is to make the risk **visible and clear** before the developer decides — not to decide for them.

### Data Flow

```
PreToolUse hook fires (Write / Edit / Read)
  │
  ▼
1. Check policy exceptions first
     match → silent allow (exit 0, no output)
     no match ↓
  ▼
2. Check sensitive path rules
     no match → silent allow
     match ↓
  ▼
3. Determine action by severity tier:
     advisory  → additionalContext   (Claude relays a friendly heads-up)
     high      → permissionDecision: "ask"  ⚠️  warning tone
     critical  → permissionDecision: "ask"  🚨  critical tone
  │
  ▼
Claude Code shows ask dialog with clear reason
User clicks Allow or Deny
```

Exceptions are checked **before** sensitive path rules — pre-approved paths never reach any dialog.

---

## Severity Tiers

| Tier | Hook output | What the developer sees |
|---|---|---|
| **advisory** | `additionalContext` with relay instruction | Claude says in its next message: *"AgentFence flagged this file as sensitive — I'll make sure not to include any secret values in my response."* |
| **high** | `permissionDecision: "ask"` | Claude Code ask dialog — ⚠️ warning tone, reason, allow/deny |
| **critical** | `permissionDecision: "ask"` | Claude Code ask dialog — 🚨 urgent tone, explains the exact risk, allow/deny |

### Default Sensitive Path Rules

| Path pattern | Op | Tier | Rationale |
|---|---|---|---|
| `.env`, `.env.*` (non-template) | read | advisory | Claude should know not to echo secrets |
| `.env`, `.env.*` (non-template) | write, edit | high | Could accidentally modify or expose credentials |
| `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks` | any | critical | Cryptographic keys — compromise is severe |
| `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519` | any | critical | SSH private keys |
| `.aws/credentials` | read | advisory | Cloud credentials |
| `.aws/credentials` | write, edit | high | Writing cloud credentials |

Templates (`.env.example`, `.env.sample`, `.env.template`, `.env.dist`) are excluded from all rules.

---

## Message Templates

### Advisory (`additionalContext`)

Phrased as an instruction to Claude so it relays the message naturally:

```
AgentFence: You are reading .env.local, which likely contains secrets (API keys, 
passwords, tokens). Please tell the user: "AgentFence flagged this file as sensitive 
— I'll make sure not to include any secret values in my response."
```

### High Ask Dialog (`permissionDecision: "ask"`)

```
⚠️  AgentFence Warning

Writing to .env.local — this file likely contains API keys and secrets.
Accidentally modifying it could expose credentials or break your app.

To pre-approve this, add to agentfence.policy.yml:
  exceptions:
    - path: ".env.local"
      ops: [write, edit]
```

### Critical Ask Dialog (`permissionDecision: "ask"`)

```
🚨  AgentFence — Critical Security Risk

Writing to server.pem — this is a cryptographic private key or certificate.
Modifying this file could compromise your server's identity and all SSL connections.

This is a HIGH RISK action. Only proceed if you are certain.

To pre-approve this, add to agentfence.policy.yml:
  exceptions:
    - path: "server.pem"
      ops: [write, edit]
```

---

## Policy Exceptions Schema

Added to the existing `agentfence.policy.yml` as a top-level `exceptions` array:

```yaml
id: my-policy
name: My Safety Policy
version: 0.1.0

rules:
  - id: credential-theft
    ...

exceptions:
  - id: allow-env-reads              # optional identifier
    path: ".env.local"               # glob pattern matched against basename
    ops: [read]                      # read | write | edit | any
    reason: "Reading env for config help is fine"   # optional, for documentation
```

### Exception matching rules

- `path` is a glob matched against the **basename** of the file path
- `ops` can include `read`, `write`, `edit`, or `any` (matches all three)
- A match on BOTH `path` AND the current op → silent allow, no dialog
- Missing `ops` defaults to `any`

### Schema additions (Zod)

```typescript
exceptionSchema = z.object({
  id: z.string().optional(),
  path: z.string().min(1),
  ops: z.array(z.enum(["read", "write", "edit", "any"])).default(["any"]),
  reason: z.string().optional(),
});

policySchema = existing + {
  exceptions: z.array(exceptionSchema).default([])
}
```

---

## Starter Policy Update

`agentfence setup` will generate a starter policy that includes a commented-out exceptions section so developers immediately know where to look:

```yaml
id: default-safety
name: Default Safety Policy
version: 0.1.0

rules:
  - id: credential-theft
    ...

# Exceptions: pre-approve specific file access to bypass the ask dialog.
# Examples:
# exceptions:
#   - path: ".env.local"
#     ops: [read]
#     reason: "Claude needs to read config for setup tasks"
#   - path: ".env.local"
#     ops: [write, edit]
#     reason: "I manage .env.local directly with Claude's help"
```

---

## Files to Change

| File | Change |
|---|---|
| `src/core/scanner/sensitive-paths.ts` | Add `tier` field (`advisory`/`high`/`critical`), add message templates per rule and per op |
| `src/core/policy/schema.ts` | Add `exceptionSchema` and `exceptions` field to `policySchema` |
| `src/types/index.ts` | Add `PolicyException` interface, update `Policy` type |
| `src/cli/commands/check.ts` | Load policy in `runHookInputCheck`, check exceptions first, format output by tier |
| `src/cli/commands/setup.ts` | Update starter policy with commented exceptions block |
| `tests/core/sensitive-paths.test.ts` | Update for new tier field and message format |
| `tests/cli/check-hook-input.test.ts` | Update for ask vs deny, advisory message relay format |
| `tests/core/policy-exceptions.test.ts` | New — exception matching logic |
| `tests/integration/check-with-exceptions.test.ts` | New — end-to-end exceptions bypass |

---

## What Is NOT in Scope

- Database / RLS checks (future version)
- Per-rule configurable `block_behavior` (Option C from brainstorm — future v2)
- Persisting allow decisions across sessions
- Remote policy management
