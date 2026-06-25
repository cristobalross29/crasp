import type { Severity } from "../../types/index.js";

export interface InboundFinding {
  ruleId: string;
  severity: Severity;
  /**
   * The offending excerpt. Used ONLY in-process for kind classification and
   * dedup. It is NEVER emitted into Claude's context or the hook log (D1/D2).
   */
  match: string;
  kind: "injection" | "secret" | "low-confidence-secret";
}

// CHARACTER (UTF-16 code-unit) cap, NOT a byte count — a 256k-char cap can be
// up to ~1MB of UTF-8. Applied before any regex runs to bound worst-case runtime
// on hostile, arbitrarily large inbound content (untrusted pages, command floods).
export const INBOUND_MAX_CHARS = 256_000;

// Recursion bound for extractInboundText — defends against deeply-nested hostile
// tool_response objects/arrays.
const MAX_EXTRACT_DEPTH = 4;

export function capInbound(text: string): string {
  if (text.length <= INBOUND_MAX_CHARS) return text;
  const sliced = text.slice(0, INBOUND_MAX_CHARS);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  // Avoid leaving a dangling high surrogate at the boundary.
  return lastCode >= 0xd800 && lastCode <= 0xdbff ? sliced.slice(0, -1) : sliced;
}

export function extractInboundText(toolResponse: unknown): string {
  const parts: string[] = [];
  let total = 0;

  // Slice each pushed string to the REMAINING budget so a single huge string
  // never produces an oversized intermediate (LOW finding) before capInbound runs.
  const push = (s: string): void => {
    if (s.length === 0) return;
    const remaining = INBOUND_MAX_CHARS - total;
    if (remaining <= 0) return;
    const piece = s.length > remaining ? s.slice(0, remaining) : s;
    parts.push(piece);
    total += piece.length;
  };

  const walk = (node: unknown, depth: number): void => {
    if (total >= INBOUND_MAX_CHARS || depth > MAX_EXTRACT_DEPTH) return;

    if (typeof node === "string") {
      push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const el of node) {
        if (total >= INBOUND_MAX_CHARS) return;
        walk(el, depth + 1);
      }
      return;
    }
    if (node !== null && typeof node === "object") {
      // Walk EVERY field — never suppress siblings once a known text key is
      // found (HIGH 4): an injection in metadata.title must still be scanned.
      // String values go in directly; nested objects/arrays recurse. Non-string
      // scalars are ignored. Depth cap + running budget still bound the work.
      //
      // MED 1: iterate keys with `for..in` and check the budget BEFORE each value
      // so a node with hundreds of thousands of keys stops early WITHOUT
      // materializing an Object.values array up front. Walk values only, never
      // keys (avoid structural-key false positives).
      const obj = node as Record<string, unknown>;
      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        if (total >= INBOUND_MAX_CHARS) return;
        const v = obj[key];
        if (typeof v === "string") push(v);
        else if (v !== null && typeof v === "object") walk(v, depth + 1);
      }
      return;
    }
    // null / undefined / number / boolean → no scannable text
  };

  walk(toolResponse, 0);
  return parts.join("\n");
}

// ── Normalization (D5) ────────────────────────────────────────────────────────
// Strip zero-width chars and Unicode bidi controls, then NFKC-normalize. Defeats
// the cheapest evasions (zero-width space inside "ignore", soft hyphen inside a
// key, fullwidth/compatibility look-alikes). NOT comprehensive — see spec limits.
// Zero-width + bidi controls: U+00AD soft hyphen, U+200B-U+200F (zero-width
// space/ZWNJ/ZWJ, LRM, RLM), U+202A-U+202E + U+2066-U+2069 (bidi embedding/
// override/isolate), U+FEFF (BOM / zero-width no-break space).
const ZERO_WIDTH_AND_BIDI =
  /[­​-‏‪-‮⁦-⁩﻿]/g;

export function normalizeInbound(text: string): string {
  return text.replace(ZERO_WIDTH_AND_BIDI, "").normalize("NFKC");
}

// Bounded quantifier (LOW 4): \S{1,2048} keeps this within the bounded-quantifier
// invariant — a multi-hundred-KB "URL" flood cannot drive a long unbounded scan.
const URL_RE = /https?:\/\/\S{1,2048}/i;
export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

interface InboundRule {
  ruleId: string;
  severity: Severity;
  pattern: RegExp;
}

// ReDoS-safety invariant (HIGH 1): EVERY whitespace quantifier in these patterns
// is BOUNDED (`\s{1,N}`), and no two whitespace-consuming groups are placed
// adjacently where one is optional. The optional politeness phrase below INCLUDES
// its own trailing whitespace (`(?:WORD\s{1,40})?`) so there is exactly one
// mandatory `\s{1,40}` before it — the absence of the phrase cannot create an
// ambiguous "optional then optional whitespace" boundary. This eliminates the
// quadratic backtracking that a flood of whitespace previously triggered.

// Model-address token followed by optional connector punctuation and one bounded
// whitespace run, then an OPTIONAL politeness phrase (which carries its own
// trailing whitespace). After this, the verb follows directly.
const ADDR = String.raw`\b(?:assistant|ai|claude|model|agent|llm|chatbot)\b[,:]?\s{1,40}(?:(?:you must|please|now|kindly)\s{1,40})?`;

// Bounded / anchored patterns only — no nested quantifiers, no unbounded
// alternation over input. Tightened (D6) so ordinary docs do not fire: each rule
// requires a model-address, a curl-pipe, or an explicit URL destination.
export const INBOUND_INJECTION_RULES: InboundRule[] = [
  {
    // Model-address token before the imperative. Politeness word is OPTIONAL
    // (HIGH 2) so a bare imperative ("Claude ignore all previous instructions")
    // fires, while a benign predicate ("Claude is a helpful assistant") does not
    // — the verb set excludes copulas.
    ruleId: "inbound-instruction-override",
    severity: "high",
    pattern: new RegExp(
      ADDR + String.raw`(?:ignore|disregard|forget|override|run|execute|fetch|send|delete|curl|exfiltrate)\b`,
      "i"
    ),
  },
  {
    // Only the unambiguous download-pipe-to-shell form — "run the following
    // command" alone no longer fires.
    ruleId: "inbound-embedded-command",
    severity: "high",
    pattern: /\bcurl\b[^\n|]{0,200}\|\s{1,20}(?:sudo\s{1,20})?(?:sh|bash|zsh)\b/i,
  },
  {
    // Exfil verb + secret noun + an explicit URL destination.
    ruleId: "inbound-data-exfil-directive",
    severity: "high",
    pattern:
      /(?:send|upload|post|exfiltrate|leak)\s{1,40}(?:the\s{1,40})?(?:(?:contents?\s{1,40}of|your)\s{1,40})?(?:\.env\b|secrets?\b|credentials?\b|api[_ -]?keys?\b|tokens?\b)[^\n]{0,80}?\b(?:to|into)\b[^\n]{0,40}?https?:\/\//i,
  },
  {
    ruleId: "inbound-trigger-on-read",
    severity: "medium",
    pattern:
      /\bwhen\s{1,40}you\s{1,40}(?:read|see|process|parse)\s{1,40}this\b|\bas\s{1,40}an?\s{1,40}(?:ai|assistant|llm)\s{1,40}(?:reading|processing|seeing)\s{1,40}this\b/i,
  },
  {
    // Tool-call imperative addressed to the model. Co-occurrence with a URL or
    // secret is enforced in detectInbound (Task 2), NOT here — so this rule's
    // raw hits are gated before they become findings.
    ruleId: "inbound-tool-injection",
    severity: "high",
    pattern: new RegExp(
      ADDR + String.raw`(?:call|invoke|use|trigger)\s{1,40}the\s{1,40}\w{1,40}\s{1,40}(?:tool|function|mcp\s{1,40}server)\b`,
      "i"
    ),
  },
];

export function checkInboundInjection(text: string): InboundFinding[] {
  const normalized = normalizeInbound(text);
  const findings: InboundFinding[] = [];
  for (const rule of INBOUND_INJECTION_RULES) {
    // inbound-tool-injection is gated in detectInbound; surface it here so the
    // gate can decide, but it is only KEPT when co-occurrence holds.
    const m = rule.pattern.exec(normalized);
    if (m) {
      findings.push({
        ruleId: rule.ruleId,
        severity: rule.severity,
        match: m[0],
        kind: "injection",
      });
    }
  }
  return findings;
}
