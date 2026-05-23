import type { Policy } from "../../types/index.js";

export const BUILTIN_POLICY: Policy = {
  id: "agentfence-builtin-security",
  name: "AgentFence Built-in Security Policy",
  version: "1.0.0",
  rules: [
    {
      id: "credential-exfiltration",
      description: "Detects instructions or claims to steal, dump, or exfiltrate credentials.",
      severity: "critical",
      target: "any",
      pattern:
        "credential theft|dump browser logins?|exfiltrate credentials|harvest tokens|steal passwords|scrape saved credentials|extract api keys|capture auth tokens|siphon credentials",
      message: "Credential exfiltration behavior detected."
    },
    {
      id: "prompt-injection",
      description: "Detects prompt injection attempts that override prior instructions.",
      severity: "high",
      target: "any",
      pattern:
        "ignore (all )?(previous|prior|above) instructions|disregard (all )?(previous|prior|above) instructions|override (the )?(system|developer) (prompt|instructions)",
      message: "Prompt injection attempt detected."
    },
    {
      id: "ssrf",
      description: "Detects server-side request forgery attempts against local or metadata services.",
      severity: "high",
      target: "any",
      pattern:
        "169\\.254\\.169\\.254|metadata\\.google\\.internal|metadata/computeMetadata/v1|internal admin endpoint",
      message: "Potential SSRF behavior detected."
    },
    {
      id: "path-traversal",
      description: "Detects path traversal attempts against sensitive files.",
      severity: "high",
      target: "any",
      pattern: "\\.\\./\\.\\.|/etc/passwd|/proc/self/environ|windows/system32|boot\\.ini",
      message: "Path traversal behavior detected."
    },
    {
      id: "code-execution",
      description: "Detects unsafe code execution primitives.",
      severity: "high",
      target: "any",
      pattern:
        "child_process|eval\\(|exec\\(|spawn\\(|subprocess\\.|os\\.system\\(|powershell -enc|curl .+\\| sh",
      message: "Unsafe code execution behavior detected."
    },
    {
      id: "data-exfiltration",
      description: "Detects attempts to exfiltrate files, databases, or private data.",
      severity: "high",
      target: "any",
      pattern:
        "exfiltrate data|upload .*(database|secrets|private data)|send .*(database|secrets|private data) to|dump customer data|leak confidential",
      message: "Data exfiltration behavior detected."
    },
    {
      id: "pii-exposure",
      description: "Detects exposure of personal identifiers and sensitive user data.",
      severity: "high",
      target: "any",
      pattern:
        "social security number|ssn\\b|credit card number|passport number|date of birth|home address",
      message: "PII exposure detected."
    },
    {
      id: "token-leakage",
      description: "Detects leaked API tokens and common secret formats.",
      severity: "critical",
      target: "any",
      pattern:
        "(?:api[_-]?key|secret[_-]?key)[ \\t]*[=:][ \\t]*[\"']?(?!(?:your|example|placeholder|change_?me|todo|xxx|<|process\\.|normalize|original|authenticated))(?=[a-z0-9._/+\\-=]*\\d)[a-z0-9][a-z0-9._/+\\-=]{15,}[\"']?|bearer[ \\t]+[a-z0-9._-]{20,}|sk-[a-z0-9]{20,}|github_pat_[a-z0-9_]+",
      message: "Token leakage detected."
    },
    {
      id: "system-prompt-extraction",
      description: "Detects attempts to reveal system or developer prompts.",
      severity: "medium",
      target: "any",
      pattern:
        "show (me )?(the )?(system|developer) prompt|reveal (the )?(system|developer) prompt|print (the )?(hidden|initial) instructions",
      message: "System prompt extraction attempt detected."
    },
    {
      id: "jailbreak-attempt",
      description: "Detects jailbreak framing intended to bypass safety controls.",
      severity: "medium",
      target: "any",
      pattern:
        "developer mode|do anything now|dan mode|jailbreak|bypass (your )?(safety|policy|guardrails)|uncensored mode",
      message: "Jailbreak attempt detected."
    }
  ]
};
