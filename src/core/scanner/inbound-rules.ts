import type { Severity } from "../../types/index.js";

export interface InboundFinding {
  ruleId: string;
  severity: Severity;
  /**
   * The offending excerpt. Used ONLY in-process for kind classification and
   * dedup. It is NEVER emitted into Claude's context or the hook log (D1/D2).
   */
  match: string;
  kind: "injection" | "secret";
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

// Keys that carry human-readable text across the tool-specific tool_response
// shapes (Read content, Bash stdout/stderr, WebFetch result/body, etc.).
const TEXT_KEYS = ["content", "stdout", "stderr", "output", "result", "text", "body", "data"] as const;

export function extractInboundText(toolResponse: unknown): string {
  const parts: string[] = [];
  let total = 0;

  const walk = (node: unknown, depth: number): void => {
    if (total >= INBOUND_MAX_CHARS || depth > MAX_EXTRACT_DEPTH) return;

    if (typeof node === "string") {
      if (node.length > 0) {
        parts.push(node);
        total += node.length;
      }
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
      const obj = node as Record<string, unknown>;
      let matchedKey = false;
      for (const key of TEXT_KEYS) {
        if (total >= INBOUND_MAX_CHARS) return;
        const v = obj[key];
        if (typeof v === "string" && v.length > 0) {
          matchedKey = true;
          parts.push(v);
          total += v.length;
        } else if (v !== null && typeof v === "object") {
          matchedKey = true;
          walk(v, depth + 1);
        }
      }
      if (!matchedKey) {
        // No known text key — stringify so we never silently skip content.
        try {
          const s = JSON.stringify(node);
          if (s) {
            parts.push(s);
            total += s.length;
          }
        } catch {
          // circular / unserializable — skip
        }
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

const URL_RE = /https?:\/\/\S+/i;
export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

interface InboundRule {
  ruleId: string;
  severity: Severity;
  pattern: RegExp;
}

// Bounded / anchored patterns only — no nested quantifiers, no unbounded
// alternation over input. Tightened (D6) so ordinary docs do not fire: each rule
// requires a model-address, a curl-pipe, or an explicit URL destination.
export const INBOUND_INJECTION_RULES: InboundRule[] = [
  {
    // Mandatory model-address token before the imperative.
    ruleId: "inbound-instruction-override",
    severity: "high",
    pattern:
      /\b(?:assistant|ai|claude|model|agent|llm|chatbot)\b[,:]?\s+(?:you\s+must|please|now|kindly)\s+(?:ignore|disregard|forget|override|run|execute|fetch|send|delete|curl|exfiltrate)\b/i,
  },
  {
    // Only the unambiguous download-pipe-to-shell form — "run the following
    // command" alone no longer fires.
    ruleId: "inbound-embedded-command",
    severity: "high",
    pattern: /\bcurl\b[^\n|]{0,200}\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/i,
  },
  {
    // Exfil verb + secret noun + an explicit URL destination.
    ruleId: "inbound-data-exfil-directive",
    severity: "high",
    pattern:
      /(?:send|upload|post|exfiltrate|leak)\s+(?:the\s+)?(?:contents?\s+of\s+|your\s+)?(?:\.env\b|secrets?\b|credentials?\b|api[_ -]?keys?\b|tokens?\b)[^\n]{0,80}?\b(?:to|into)\b[^\n]{0,40}?https?:\/\//i,
  },
  {
    ruleId: "inbound-trigger-on-read",
    severity: "medium",
    pattern:
      /\bwhen\s+you\s+(?:read|see|process|parse)\s+this\b|\bas\s+an?\s+(?:ai|assistant|llm)\s+(?:reading|processing|seeing)\s+this\b/i,
  },
  {
    // Tool-call imperative addressed to the model. Co-occurrence with a URL or
    // secret is enforced in detectInbound (Task 2), NOT here — so this rule's
    // raw hits are gated before they become findings.
    ruleId: "inbound-tool-injection",
    severity: "high",
    pattern:
      /\b(?:assistant|ai|claude|model|agent|llm)\b[,:]?\s+(?:you\s+must|please|now|kindly)?\s*(?:call|invoke|use|trigger)\s+the\s+\w{1,40}\s+(?:tool|function|mcp\s+server)\b/i,
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
