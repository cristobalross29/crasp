import type { Policy } from "../../types/index.js";

export const BUILTIN_POLICY: Policy = {
  id: "crasp-builtin-security",
  name: "Crasp Built-in Security Policy",
  version: "1.0.0",
  rules: [
    {
      id: "credential-exfiltration",
      description: "Detects instructions or claims to steal, dump, or exfiltrate credentials.",
      severity: "critical",
      target: "any",
      pattern:
        "(?:credential (?:theft|exfiltration)|(?:dump|steal|scrape|harvest|extract|capture|siphon) (?:browser )?(?:saved )?(?:passwords?|logins?|credentials?|tokens?|api[_ -]?keys?|auth(?:entication)? tokens?)|(?:exfiltrate|leak) (?:credentials?|tokens?|api[_ -]?keys?))",
      message: "Credential exfiltration behavior detected."
    },
    {
      id: "prompt-injection",
      description: "Detects prompt injection attempts that override prior instructions.",
      severity: "high",
      target: "any",
      pattern:
        "(?:^|[.!?\\n]\\s*)(?:ignore|disregard|forget|override) (?:all )?(?:previous|prior|above|earlier|system|developer) (?:instructions|prompts?|rules)|system override|(?:act|pretend) as if (?:there are no|you have no) (?:rules|restrictions)",
      message: "Prompt injection attempt detected."
    },
    {
      id: "ssrf",
      description: "Detects server-side request forgery attempts against local or metadata services.",
      severity: "high",
      target: "any",
      pattern:
        "169\\.254\\.169\\.254|metadata\\.google\\.internal|metadata/computeMetadata/v1|latest/meta-data|instance-data/latest|internal admin endpoint",
      message: "Potential SSRF behavior detected."
    },
    {
      id: "path-traversal",
      description: "Detects path traversal attempts against sensitive files.",
      severity: "high",
      target: "any",
      pattern:
        "(?:\\.\\./){2,}(?:etc/passwd|proc/self/environ|\\.ssh|id_rsa|windows/system32|boot\\.ini)|/etc/passwd|/proc/self/environ|/root/\\.ssh|/home/[^\\s]+/\\.ssh|windows[\\\\/]+system32|boot\\.ini",
      message: "Path traversal behavior detected."
    },
    {
      id: "code-execution",
      description: "Detects unsafe code execution primitives.",
      severity: "high",
      target: "any",
      pattern:
        "child_process\\.(?:exec|execFile|spawn|fork)|(?:exec|spawn)\\s*\\(|subprocess\\.(?:Popen|run|call)\\s*\\(|os\\.system\\s*\\(|eval\\s*\\(|Function\\s*\\(|powershell\\s+-(?:enc|encodedcommand)|curl\\s+(?:-[a-zA-Z]*\\s+)?https?://[^\\n|]+\\|\\s*(?:sh|bash)",
      message: "Unsafe code execution behavior detected."
    },
    {
      id: "data-exfiltration",
      description: "Detects attempts to exfiltrate files, databases, or private data.",
      severity: "high",
      target: "any",
      pattern:
        "(?:exfiltrate|leak|dump) (?:data|database|customer data|customer database|confidential files?|private data|secrets?)|(?:upload|send|copy) (?:the )?(?:database|customer data|customer database|confidential files?|private data|secrets?|\\.env) (?:to|into|out|offsite|external|remote)",
      message: "Data exfiltration behavior detected."
    },
    {
      id: "pii-exposure",
      description: "Detects exposure of personal identifiers and sensitive user data.",
      severity: "high",
      target: "any",
      pattern:
        "social security number|\\bssn\\b|credit card number|passport number|date of birth|home address|driver'?s license number|taxpayer identification number",
      message: "PII exposure detected."
    },
    {
      id: "token-leakage",
      description: "Detects leaked API tokens and common secret formats.",
      severity: "critical",
      target: "any",
      pattern:
        "(?:(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)[ \\t]*[=:][ \\t]*[\"']?(?!(?:your|example|placeholder|change_?me|todo|xxx|<|process\\.|normalize|original|authenticated))(?=[a-z0-9._/+\\-=]*\\d)[a-z0-9][a-z0-9._/+\\-=]{15,}[\"']?|bearer[ \\t]+[a-z0-9._-]{20,}|sk-[a-z0-9]{20,}|github_pat_[a-z0-9_]+|ghp_[a-z0-9]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)",
      message: "Token leakage detected."
    },
    {
      id: "system-prompt-extraction",
      description: "Detects attempts to reveal system or developer prompts.",
      severity: "medium",
      target: "any",
      pattern:
        "(?:^|[.!?\\n]\\s*)(?:show|reveal|print|dump|export) (?:me )?(?:the )?(?:system|developer|hidden|initial) (?:prompt|instructions|message)",
      message: "System prompt extraction attempt detected."
    },
    {
      id: "jailbreak-attempt",
      description: "Detects jailbreak framing intended to bypass safety controls.",
      severity: "medium",
      target: "any",
      pattern:
        "developer mode|do anything now|dan mode|jailbreak|bypass (?:your )?(?:safety|policy|guardrails|filters)|uncensored mode|no safety filters",
      message: "Jailbreak attempt detected."
    }
  ]
};
