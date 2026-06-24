import type { Severity } from "../../types/index.js";

export interface SecretFinding {
  ruleId: string;
  severity: Severity;
  index: number;
  length: number;
}

// Findings are "born redacted": they never carry the raw secret value.
// Max input length mirrors bash-rules.ts MAX_SCAN_LENGTH.
export const MAX_SECRET_SCAN_LENGTH = 1_000_000;

interface ProviderRule {
  ruleId: string;
  severity: Severity;
  regex: RegExp;
  entropyFloor?: number;
  validate?: (captured: string) => boolean;
}

// Shannon entropy (bits per character) of a string.
function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  let e = 0;
  for (const count of Object.values(freq)) {
    const p = count / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

// Total JWT validator — must not throw.
function isValidJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const decode = (s: string) =>
      Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const header = JSON.parse(decode(parts[0]));
    const payload = JSON.parse(decode(parts[1]));
    return (
      typeof header === "object" &&
      header !== null &&
      typeof payload === "object" &&
      payload !== null
    );
  } catch {
    return false;
  }
}

// Provider rule table.
// Every regex uses a non-capturing prefix so group 1 is the secret value itself.
// Regexes are NOT global — they're run in a manual exec loop below.
const PROVIDER_RULES: ProviderRule[] = [
  // ── AWS ─────────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-aws-akia",
    severity: "critical",
    // AWS access key IDs: AKIA + 16 uppercase letters/digits
    regex: /(?<![A-Z0-9])(AKIA[0-9A-Z]{16})(?![A-Z0-9])/,
    entropyFloor: 3.0,
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-anthropic",
    severity: "critical",
    regex: /(sk-ant-(?:api03|admin01)-[A-Za-z0-9_\-]{93}AA)/,
    entropyFloor: 3.5,
  },

  // ── OpenAI (T3BlbkFJ marker = base64 of "OpenAI") ───────────────────────────
  {
    ruleId: "secret-openai",
    severity: "critical",
    regex: /(sk-(?:proj-|[a-zA-Z0-9]{20}T3BlbkFJ)[A-Za-z0-9_\-]{20,80})/,
    entropyFloor: 3.0,
  },

  // ── GitHub ───────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-github",
    severity: "critical",
    // ghp_, gho_, ghu_, ghs_ + 36 alphanumeric chars
    regex: /((?:ghp|gho|ghu|ghs)_[0-9A-Za-z]{36})/,
    entropyFloor: 3.5,
  },
  {
    ruleId: "secret-github",
    severity: "critical",
    // Long-form github_pat_
    regex: /(github_pat_[A-Za-z0-9_]{82})/,
    entropyFloor: 3.5,
  },

  // ── GitLab ───────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-gitlab",
    severity: "critical",
    regex: /(glpat-[0-9A-Za-z\-_]{20})/,
    entropyFloor: 3.0,
  },

  // ── Stripe ───────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-stripe",
    severity: "critical",
    regex: /((?:sk|rk)_(?:test|live|prod)_[A-Za-z0-9]{10,99})/,
    // Entropy gate on the variable suffix only (after the last underscore) — rejects placeholders
    // like "PLACEHOLDER" (suffix entropy ~3.09) while keeping real Stripe keys (suffix entropy ~4.5+).
    validate(captured: string): boolean {
      try {
        const suffix = captured.slice(captured.lastIndexOf("_") + 1);
        return shannonEntropy(suffix) >= 3.5;
      } catch {
        return false;
      }
    },
  },
  {
    ruleId: "secret-stripe-webhook",
    severity: "critical",
    regex: /(whsec_[A-Za-z0-9]{32,})/,
    entropyFloor: 3.0,
  },

  // ── Google ───────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-google-api",
    severity: "critical",
    // Google API key: AIza + 35 chars
    regex: /(AIza[0-9A-Za-z\-_]{35})/,
    entropyFloor: 3.0,
  },
  {
    ruleId: "secret-google-oauth",
    severity: "critical",
    // Google OAuth client secret
    regex: /(GOCSPX-[0-9A-Za-z\-_]{28})/,
    entropyFloor: 3.0,
  },
  {
    ruleId: "secret-google-oauth",
    severity: "critical",
    // Google OAuth refresh token
    regex: /(1\/\/[0-9A-Za-z\-_]{43,})/,
    entropyFloor: 3.5,
  },

  // ── Azure ────────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-azure",
    severity: "critical",
    // Azure client secret: Q~ prefix + 34-38 chars
    regex: /(Q~[0-9A-Za-z.\-_]{34,38})/,
    entropyFloor: 3.0,
  },

  // ── Slack ────────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-slack",
    severity: "critical",
    // Slack bot/user/workspace/app tokens: xox{b,p,a,s,e}-...
    regex: /(xox[bpase]-[0-9A-Za-z\-]{10,})/,
    entropyFloor: 3.0,
  },
  {
    ruleId: "secret-slack-webhook",
    severity: "critical",
    regex: /(https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9_]{8,}\/B[A-Za-z0-9_]{8,}\/[A-Za-z0-9_]{20,})/,
  },

  // ── SendGrid ─────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-sendgrid",
    severity: "critical",
    regex: /(SG\.[0-9A-Za-z\-_]{20,}\.[0-9A-Za-z\-_]{30,})/,
    entropyFloor: 3.0,
  },

  // ── Twilio ───────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-twilio",
    severity: "critical",
    // Twilio Account SID (AC...) or API Key SID (SK...)
    regex: /((?:AC|SK)[0-9a-f]{32})/,
    entropyFloor: 3.0,
  },

  // ── HuggingFace ──────────────────────────────────────────────────────────────
  {
    ruleId: "secret-huggingface",
    severity: "critical",
    regex: /(hf_[0-9A-Za-z]{34,})/,
    entropyFloor: 3.0,
  },

  // ── npm ──────────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-npm",
    severity: "critical",
    regex: /(npm_[0-9A-Za-z]{36})/,
    entropyFloor: 3.0,
  },

  // ── PyPI ─────────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-pypi",
    severity: "critical",
    regex: /(pypi-[0-9A-Za-z_\-]{28,})/,
    entropyFloor: 3.0,
  },

  // ── DigitalOcean ─────────────────────────────────────────────────────────────
  {
    ruleId: "secret-digitalocean",
    severity: "critical",
    regex: /(dop_v1_[0-9a-f]{64})/,
    entropyFloor: 3.0,
  },

  // ── Datadog ──────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-datadog",
    severity: "critical",
    // Datadog API/App keys: DD prefix + 32 hex chars
    regex: /(DD[0-9A-Fa-f]{32})/,
    entropyFloor: 3.0,
  },

  // ── Cloudflare ───────────────────────────────────────────────────────────────
  {
    ruleId: "secret-cloudflare",
    severity: "critical",
    regex: /(cf_[0-9A-Za-z]{36,})/,
    entropyFloor: 3.0,
  },

  // ── Shopify ──────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-shopify",
    severity: "critical",
    regex: /(shpat_[0-9a-fA-F]{32})/,
    entropyFloor: 3.0,
  },

  // ── Square ───────────────────────────────────────────────────────────────────
  {
    ruleId: "secret-square",
    severity: "critical",
    // Square access token: EAAAl prefix + 40+ chars
    regex: /(EAAAl[0-9A-Za-z]{40,})/,
    entropyFloor: 3.0,
  },

  // ── DB / URL connection strings ──────────────────────────────────────────────
  {
    ruleId: "secret-db-conn",
    severity: "critical",
    // Structural rule — embedded password after the colon before @
    // postgres/mysql/mongodb/redis/amqp/mssql :// user : password @ host
    regex: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^:/\s]+:([^@/\s]{3,})@[^\s/]+/i,
    // Require at least one digit in the password to avoid "user:password@" placeholders
    validate(captured: string): boolean {
      try {
        return /\d/.test(captured) || shannonEntropy(captured) >= 3.0;
      } catch {
        return false;
      }
    },
  },

  // ── PEM / SSH private keys ───────────────────────────────────────────────────
  {
    ruleId: "secret-pem",
    severity: "critical",
    // PEM/SSH header + at least 64 chars of body (kills header-in-docs FP)
    regex: /(-----BEGIN (?:[A-Z ]+) (?:PRIVATE KEY|CERTIFICATE)-----[\s\S]{64,})/,
  },

  // ── JWT (advisory — structural validity ≠ secret) ───────────────────────────
  {
    ruleId: "secret-jwt",
    severity: "medium",
    // Three base64url segments separated by dots.
    // Lookbehind (?<![A-Za-z0-9_-]) ensures we only start at a token boundary;
    // this prevents O(n²) backtracking on monotone runs of base64url chars
    // (without it, each char in a million-char 'AAAA…' run would trigger a full match attempt).
    regex: /(?<![A-Za-z0-9_\-])([A-Za-z0-9_\-]{20,2000}\.[A-Za-z0-9_\-]{20,2000}\.[A-Za-z0-9_\-]{20,2000})/,
    validate: isValidJwt,
  },
];

function maskValue(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
}

export function maskSpan(text: string, index: number, length: number): string {
  const span = text.slice(index, index + length);
  return maskValue(span);
}

export function maskSpanInLine(
  text: string,
  index: number,
  length: number,
  line: number
): string {
  const lines = text.split("\n");
  const lineText = lines[line] ?? "";
  const lineStart = lines.slice(0, line).reduce((acc, l) => acc + l.length + 1, 0);
  const offsetInLine = index - lineStart;
  const span = lineText.slice(offsetInLine, offsetInLine + length);
  return lineText.slice(0, offsetInLine) + maskValue(span) + lineText.slice(offsetInLine + length);
}

export function detectSecrets(text: string, _filePath?: string): SecretFinding[] {
  const input = text.slice(0, MAX_SECRET_SCAN_LENGTH);
  const findings: SecretFinding[] = [];

  for (const rule of PROVIDER_RULES) {
    const gRegex = new RegExp(rule.regex.source, rule.regex.flags.includes("i") ? "gi" : "g");
    let m: RegExpExecArray | null;
    while ((m = gRegex.exec(input)) !== null) {
      // group 1 is the secret value; group 0 is the full match
      const captured = m[1] ?? m[0];
      const fullMatch = m[0];

      // Advance past empty matches to avoid infinite loop
      if (fullMatch.length === 0) {
        gRegex.lastIndex++;
        continue;
      }

      if (rule.entropyFloor !== undefined && shannonEntropy(captured) < rule.entropyFloor) {
        continue;
      }

      if (rule.validate !== undefined) {
        let ok = false;
        try {
          ok = rule.validate(captured);
        } catch {
          ok = false;
        }
        if (!ok) continue;
      }

      const index = m.index + (m[1] !== undefined ? fullMatch.indexOf(captured) : 0);
      findings.push({
        ruleId: rule.ruleId,
        severity: rule.severity,
        index,
        length: captured.length,
      });
    }
  }

  return findings;
}
