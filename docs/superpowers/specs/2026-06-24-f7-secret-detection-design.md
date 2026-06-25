# F7 — Stronger Secret Detection (Design)

**Status:** Approved design, pre-implementation
**Date:** 2026-06-24
**Roadmap item:** F7 (stronger secrets)
**Review:** 4-lens adversarial review (effectiveness, false-positive/DX, architecture, performance/ReDoS)

## Goal

Replace the single `token-leakage` mega-regex with a dedicated, confidence-tiered secret
detector that improves **both** recall (more providers + generic high-entropy) **and** precision
(noisy generic matches warn instead of block), without weakening the trustworthiness of the
critical-tier block. Local/offline only — no network key validation.

Strategic framing: for a security tool, false positives are the primary adoption killer. The
design therefore tiers by confidence — known-provider formats are near-zero-FP and block;
generic high-entropy strings are inherently noisy and only warn — matching how GitHub, gitleaks,
and detect-secrets all operate.

## Current state (verified against code)

- Detection today = one builtin policy rule `token-leakage` (critical) in
  `src/core/patterns/builtin.ts`: a single mega-regex (known prefixes, `bearer`, PEM headers, a
  generic `key=value` heuristic). No entropy. No per-type rule IDs. No dedicated module.
- `scanContent(content, policy, filePath?)` (`src/core/scanner/index.ts`) is the shared chokepoint
  for Write/Edit, Bash, inbound (F2), and MCP `crasp_scan`. It returns `FileScanResult { matches }`.
- Action mapping in `check.ts` is severity-driven: `high|critical` → deny (Write/Edit) / ask (Bash);
  `medium|low` → advisory. So confidence tiering needs no new action-mapping code.
- Constraints found by review:
  - Redaction is allow-listed by the literal rule ID `"token-leakage"` (`redact.ts:13`,
    `scan-output.ts:74`); the deny path echoes raw `m.match` (`check.ts:64/214/332`).
  - `runHookInputCheck` (the Write/Edit/Bash hot path) lacks the top-level fail-open try/catch that
    `runInboundHookCheck` has.
  - `runInboundHookCheck` emits its untrusted-data caution for **any** finding (no severity gate).
  - `scanContent` on the Write/Edit path has **no length cap** (inbound caps 256k, bash 1MB).
  - The existing generic arm uses an unbounded lookahead `(?=…*\d)` that is O(n²) under global exec.

## Architecture

A dedicated module `src/core/scanner/secrets.ts` holds **both** a provider table and the generic
entropy detector, routed through `scanContent` so all four surfaces light up from one integration
point. The multi-surface routing is made safe by two structural decisions below ("born redacted"
findings + a redaction rule-ID set), which is what distinguishes this from the rejected naive
version that leaked secret values.

### Module API

```ts
export interface SecretFinding {
  ruleId: string;     // per-provider, e.g. "secret-aws-akia", "secret-anthropic",
                      // "secret-db-conn", or "secret-generic-entropy"
  severity: Severity; // critical = provider (deny) ; low|medium = generic entropy (advisory)
  index: number;      // start offset in text
  length: number;     // span length — enables masking WITHOUT storing the raw value
}
// Findings are "born redacted": they never carry the raw secret value, so they cannot leak
// regardless of which surface or echo path consumes them.
export function detectSecrets(text: string, filePath?: string): SecretFinding[];
```

- **Provider table:** `{ ruleId, severity, regex, entropyFloor?, validate?() }`, one entry per
  provider, **each with its own rule ID** (decision D1) for dashboard/hook-log observability.
- **Generic entropy detector:** emits only `secret-generic-entropy` at low/medium.

### Integration point

In `scanContent` (`index.ts`), after the policy-rule loop and before returning, append findings:

```ts
for (const f of detectSecrets(content, filePath)) {
  const pos = positionAt(content, f.index);
  matches.push({
    ruleId: f.ruleId,
    ruleName: ruleNameFor(f.ruleId),
    severity: f.severity,
    line: pos.line,
    column: pos.column,
    match: maskSpan(content, f.index, f.length),        // masked at construction — never raw
    context: maskSpanInLine(content, f.index, f.length, pos.line), // span masked WITHIN the line
  });
}
```

### Severity → action (no new mapping)

| Detector | severity | Write/Edit | Bash | Inbound | MCP |
|---|---|---|---|---|---|
| Provider (validated) | critical | deny | ask | caution† | violations[] |
| Generic entropy | low/medium | advisory (silent log) | silent | caution† | violations[] |

† Inbound caution is confidence-gated — see Must-Fix 4.

The existing `token-leakage` builtin rule is **removed**; its provider coverage moves into the
module's table (no dual path).

## Must-fix safety items (in scope for F7)

1. **Redaction generalization.** Replace the literal `ruleId === "token-leakage"` checks in
   `redact.ts:13` and `scan-output.ts:74` with a shared `SECRET_RULE_IDS` set (every `secret-*`
   ID). Strip the raw `m.match` echo on the deny path (`check.ts:64/214/332`) for secret findings.
   The "born redacted" finding shape makes this robust by construction.

2. **Fail-open hot path.** Wrap the body of `runHookInputCheck` and `runBashHookCheck` in an outer
   try/catch → `exit 0` + log, mirroring `runInboundHookCheck`'s fail-open pattern. The JWT
   `validate()` must be total (try/catch → `false`). This must land before the detector ships,
   since it base64-decodes and JSON-parses attacker-influenced substrings.

3. **Bounds (the only hang defense — synchronous hook, no watchdog).**
   - `MIN_TOKEN_LENGTH = 20` — discards the millions-of-tiny-tokens DoS at the tokenizer.
   - `MAX_TOKEN_LENGTH = 120` — enforced in the tokenizer regex `{20,120}`, never unbounded `+`;
     tokens longer than the cap are rejected, not windowed.
   - `MAX_TOKENS ≈ 1000` with early-exit.
   - `MAX_SECRET_SCAN_LENGTH` — detectSecrets self-slices (mirrors `bash-rules.ts` `MAX_SCAN_LENGTH`).
   - No unbounded lookahead: the "must contain a digit" gate becomes a single-pass `/\d/.test(token)`
     on the captured token, never a regex lookahead under a global-exec loop.
   - Filter order: cheapest-reject-first (length/charset → entropy → UUID/SHA regex filters).

4. **Inbound confidence gate.** `runInboundHookCheck` must not fire the untrusted-data caution on a
   generic-entropy (low-confidence) finding alone; gate on provider/high-confidence findings, or
   require co-occurrence (as the inbound injection rules already do). Otherwise every fetched page
   or lockfile containing a base64 hash would degrade Claude mid-task.

## Precision package (false-positive control)

Applies to the **generic entropy detector only** — provider matchers always run, on every file.

- **Path/extension skip for generic entropy:** lockfiles (`package-lock.json`, `pnpm-lock.yaml`,
  `yarn.lock`, `Cargo.lock`, `go.sum`, `poetry.lock`, `*.lock`), `*.min.js`, `*.min.css`, `*.map`,
  `*.snap`. (`scanContent` already plumbs `filePath`.)
- **Per-line hash-prefix gate:** drop tokens whose line contains `sha512-`/`sha384-`/`sha256:`/
  `integrity`/`h1:`/`resolved`/`digest`.
- **No windowing:** reject tokens longer than `MAX_TOKEN_LENGTH` outright (a data URI yields zero
  findings, not dozens).
- **Entropy floors:** base64 ≥ 4.5 bits/char; hex ≥ 3.0 with a numeric penalty (or keyword-anchor
  hex — a 40-char SHA always clears a 3.0 floor). Apply a **per-rule entropy floor** to provider
  captures so `sk_live_PLACEHOLDER` is rejected.
- **Allowlist + inline ignore:** honor a trailing `# crasp:allow` / `// crasp:allow`; optional
  `secrets.allowlist` in `crasp.policy.yml`. Extends the existing `exceptions` + placeholder denylist.
- **Dedup** on the masked value (not index); collapse repeats with a count.
- **Noise denylist (DROP):** dashless and non-v4 UUIDs, base32, IPv6 literals, hex-color runs,
  docker `sha256:` digests, the public jwt.io sample JWT. Keep the DROP list tight (whitelisted
  shapes are exfil channels — prefer demote-don't-drop for ambiguous cases).

## Provider coverage (critical → block, unless noted)

Regexes sourced from the gitleaks master config.

- **Fix existing:** GitHub `(?:ghp|gho|ghu|ghs)_[0-9A-Za-z]{36}` + `github_pat_\w{82}` (drop the
  non-existent `ghr_`); OpenAI current format with the `T3BlbkFJ` marker; Stripe
  `(?:sk|rk)_(?:test|live|prod)_[A-Za-z0-9]{10,99}` + webhook `whsec_[A-Za-z0-9]{32,}`.
- **Tier 1 (add):** Anthropic `sk-ant-(api03|admin01)-[A-Za-z0-9_\-]{93}AA`; **DB/URL connection
  strings with embedded password** — structural rule
  `(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql)://[^:/\s]+:([^@/\s]+)@[^\s/]+`
  (entropy cannot catch low-entropy DB passwords; critical); generic URL-embedded creds.
- **Tier 2 (add):** Google OAuth `GOCSPX-…` + refresh `1//…`; GCP service-account JSON; Azure
  client secret (`Q~` infix) + storage key; SendGrid `SG.…`; Twilio `SK…`/`AC…`; HuggingFace
  `hf_…`; PyPI `pypi-…`.
- **Tier 3 / framework:** SSH/PEM header **plus ≥64-char body** (kills the header-in-docs FP); Slack
  webhook URL; long tail (DigitalOcean, Datadog, Cloudflare, Shopify, Square) as one-line table rows.
- Keep `sk_test`/non-live provider keys at **critical** (still live credentials).
- **JWT → advisory** (decision D2), not deny — structural validity ≠ secret; the jwt.io sample
  appears in READMEs and must not block a doc write. Escalate only if it carries secret-bearing claims.

## Known limitations (documented, not all fixable now)

Base64/hex-wrapped secrets, cross-line concatenation / env-var substitution, non-ASCII/homoglyph
padding, and PEM body-split evade detection — shared blind spots with trufflehog/gitleaks. The
connection-string structural rule and a tight DROP list mitigate the highest-value cases; the rest
are logged as accepted limits.

## Testing

- `tests/core/secrets.test.ts`: each provider sample matches; near-miss + placeholder do not;
  entropy catches a random base64 blob; lockfile `sha512-`, data URI, minified blob, UUID, git SHA,
  and the jwt.io sample do **not** fire (or only advisory); the connection-string password fires
  critical; bounds terminate (one giant token; 64k tiny tokens); JWT `validate` is total on malformed.
- Update `patterns.test.ts` (token-leakage reshaped/removed), `check-hook-input.test.ts` (provider
  denies; generic only advisory; **deny reason is masked**), redaction tests for the new IDs, an
  inbound confidence-gate test, and an MCP-scan redaction test.
- Fail-open test: `detectSecrets` throws → hook exits 0.

## Suggested sequencing

Land the safety refactors first — they are independent of the detector and de-risk everything after:

1. **Safety refactors (no behavior change):** redaction `SECRET_RULE_IDS` set + masked deny-path
   echo; fail-open wrap of `runHookInputCheck`/`runBashHookCheck`; inbound confidence gate. These can
   ship and be tested against the *existing* `token-leakage` rule before any new detection exists.
2. **Module + provider table:** introduce `secrets.ts`, move/expand provider coverage, remove the old
   `token-leakage` rule, wire into `scanContent`. Critical-tier behavior reaches parity, then exceeds.
3. **Generic entropy detector + precision package:** the bounded entropy detector and all FP controls.

This ordering means the riskiest change (a new detector parsing hostile input) only lands once the
fail-open and redaction guarantees are already in place and tested.

## Codex final-review amendments (binding — must be covered by the implementation)

Final independent Codex review: **agree-with-changes**. Resolutions, each to be implemented and tested:

- **R1 — 4th echo site.** `crasp policy check` prints raw `match.match` at `src/cli/commands/policy.ts:71` — a leak site the must-fix list missed. Route it through the shared secret redaction and add a redaction test for it.
- **R2 — context masking.** `lineAt()` returns the full trimmed line (`index.ts:240-241`). Mask the span inside `context` at construction (`maskSpanInLine`), not via a later `context.replace()`.
- **R3 — migration/sequencing.** `SECRET_RULE_IDS` contains `token-leakage` **and** all `secret-*` ids during migration, so the Phase-1 redaction refactor is testable against the existing rule. Drop `token-leakage` from the set only when the rule is removed in Phase 2. (Resolves the spec-internal contradiction Codex flagged.)
- **R4 — legacy-id reservation.** `src/core/patterns/index.ts` dedupes user rules against builtins; removing builtin `token-leakage` would let a *user* rule with that id become active. Explicitly reserve/drop the legacy `token-leakage` id in the merge.
- **R5 — policy visibility.** Removing `token-leakage` from `BUILTIN_POLICY` drops secret detection from `crasp_policy` and `crasp policy list`. Add a synthetic read-only "built-in secret detection" descriptor to those surfaces (serves the make-protection-visible goal) and test it.
- **R6 — inbound gate (precise).** Generic-entropy findings must (a) NOT fire the inbound caution alone, and (b) NOT satisfy the tool-injection co-occurrence gate (`inbound.ts:21-32` `sawSecret`). Only provider/high-confidence secret findings may set `sawSecret` or trigger the caution.
- **R7 — allowlist schema.** `secrets.allowlist` needs new schema/types (`src/types/index.ts`, `src/core/policy/schema.ts`) — currently absent. Define precedence vs existing `exceptions` (which skip path dialogs, not content scan): allowlist suppresses a secret finding by value/regex; exceptions stay path/op based.
- **R8 — scan cap value.** `MAX_SECRET_SCAN_LENGTH = 1_000_000` chars (matches `bash-rules.ts`). Provider regexes **and** the entropy detector run only on the bounded slice.
- **R9 — dedup key.** Born-redacted fixed masks collide across unrelated secrets. Dedup by `(ruleId, index)` offset (or a private, non-emitted fingerprint), NOT by masked value; drop value-based repeat-collapse.
- **R10 — scenarios out of scope.** Scenario evaluation (`violations/detector.ts`, `engine.ts`) scans user `policy.rules` only and does **not** `mergeWithBuiltin`, so builtin `token-leakage` never applied to scenarios. F7 secrets are therefore **out of scope** for scenario eval (no behavior change). State this in docs; update any test that assumed otherwise.

**Housekeeping before shipping:** bump version in `src/cli/index.ts` + `package.json`; update `CHANGELOG.md`; update README examples showing `token-leakage` (`README.md:66-82, 141-150`); update the F2 spec note that attributes inbound secret coverage to `token-leakage` (`2026-06-12-f2-inbound-scanning-design.md:169-171`).

## Out of scope (YAGNI)

Network / live-key validation (stays local-offline); trufflehog-style verification; the full long-tail
provider catalogue (the table makes additions one-liners — add on demand).
