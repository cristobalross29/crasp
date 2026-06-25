import type { Policy } from "../../types/index.js";
import { scanContent } from "./index.js";
import {
  checkInboundInjection,
  containsUrl,
  type InboundFinding,
} from "./inbound-rules.js";

// Builtin rule ids whose hits represent injected instructions (vs. secrets).
const INJECTION_RULE_IDS = new Set([
  "prompt-injection",
  "jailbreak-attempt",
  "system-prompt-extraction",
  "credential-exfiltration",
  "data-exfiltration",
]);

export function detectInbound(text: string, policy: Policy): InboundFinding[] {
  const findings: InboundFinding[] = [];

  let sawSecret = false;
  for (const m of scanContent(text, policy).matches) {
    if (INJECTION_RULE_IDS.has(m.ruleId)) {
      findings.push({ ruleId: m.ruleId, severity: m.severity, match: m.match, kind: "injection" });
    } else if (m.severity === "critical") {
      // Only provider-tier (critical) secrets set sawSecret and participate in the
      // inbound co-occurrence gate. Low/medium hits (e.g. secret-generic-entropy)
      // are returned as low-confidence-secret so the caution path can exclude them.
      sawSecret = true;
      findings.push({ ruleId: m.ruleId, severity: m.severity, match: m.match, kind: "secret" });
    } else {
      // When a provider secret span also fires secret-generic-entropy, both survive
      // dedup (different ruleIds); the entropy duplicate is kind "low-confidence-secret"
      // and is excluded from the inbound caution — behavior is correct.
      findings.push({ ruleId: m.ruleId, severity: m.severity, match: m.match, kind: "low-confidence-secret" });
    }
  }

  // D6 co-occurrence gate: a bare tool-call instruction is too common in docs to
  // flag on its own. Keep it only when a URL or a secret co-occurs in the text.
  const hasUrl = containsUrl(text);
  for (const f of checkInboundInjection(text)) {
    if (f.ruleId === "inbound-tool-injection" && !hasUrl && !sawSecret) continue;
    findings.push(f);
  }

  // De-dup by (ruleId, match) — a scanContent injection hit and an inbound-rule
  // hit can land on the same text; collapse those (D13).
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.ruleId} ${f.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
