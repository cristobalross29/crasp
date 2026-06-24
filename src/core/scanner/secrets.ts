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
  // Regexes MUST use the `d` flag (hasIndices) so m.indices[1] gives the
  // exact group-1 offset. The exec loop adds `g` automatically.
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

// DB URL schemes covered by secret-db-conn.
// Also used as the negative-lookahead exclusion list in secret-url-creds so the
// two rules share one source of truth and cannot drift independently.
const DB_SCHEMES = "postgres(?:ql)?|mysql|mongodb(?:\\+srv)?|redis|amqp|mssql";

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

  // ── OpenAI ───────────────────────────────────────────────────────────────────
  // Precision-over-recall decision: proj/svcacct/admin variants MUST contain the
  // T3BlbkFJ marker (base64("OpenAI")). Real current OpenAI project keys always
  // embed this marker, giving near-zero false positives at the deny tier. A bare
  // sk-proj- without the marker is intentionally NOT matched by this rule.
  // Generous flanking bounds ({58,74} on each side) absorb small key-length variance.
  {
    ruleId: "secret-openai",
    severity: "critical",
    regex: /(sk-(?:proj|svcacct|admin)-[A-Za-z0-9_\-]{58,74}T3BlbkFJ[A-Za-z0-9_\-]{58,74})/d,
  },
  // Legacy format: sk- followed by 20–100 alphanumeric chars (no proj/svcacct/admin prefix)
  {
    ruleId: "secret-openai",
    severity: "critical",
    regex: /(sk-(?!(?:proj|svcacct|admin)-)(?!ant-)[A-Za-z0-9]{20,100})/d,
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
  // DB_SCHEMES is shared with secret-url-creds below (they must not drift).
  {
    ruleId: "secret-db-conn",
    severity: "critical",
    // Structural rule — embedded password after the colon before @
    // postgres/mysql/mongodb/redis/amqp/mssql :// user : password @ host
    // `d` flag gives m.indices[1] = exact [start,end] of the password group,
    // fixing the indexOf offset bug when username == password.
    // OR gate: the structural DB rule catches passwords that entropy alone can't
    // (digit-free high-entropy strings like "WinterIsComing"). Require EITHER a
    // digit OR entropy >= 3.0 to reject common short/simple placeholders
    // ("password" has no digit and entropy 2.75 — correctly rejected).
    regex: new RegExp(
      `(?:${DB_SCHEMES}):\\/\\/[^:/\\s]+:([^@/\\s]{3,})@[^\\s/]+`,
      "id"
    ),
    validate(captured: string): boolean {
      try {
        return /\d/.test(captured) || shannonEntropy(captured) >= 3.0;
      } catch {
        return false;
      }
    },
  },
  // ── Generic URL-embedded credentials (any scheme except named DB schemes) ────
  // DB_SCHEMES negative-lookahead is built from the same constant as secret-db-conn above.
  {
    ruleId: "secret-url-creds",
    severity: "critical",
    // Matches scheme://user:password@host for any scheme NOT already caught by
    // secret-db-conn (postgres/mysql/mongodb/redis/amqp/mssql).
    // `d` flag for accurate group-1 offset. Negative lookahead excludes DB schemes.
    // (?<![a-zA-Z]) ensures the match starts at a token boundary, so
    // "postgres://..." cannot be matched starting at the 'o' (skipping 'p').
    regex: new RegExp(
      `(?<![a-zA-Z])(?!(?:${DB_SCHEMES}):\\/\\/)[a-zA-Z][a-zA-Z0-9+\\-.]{1,30}:\\/\\/[^:/\\s@]{1,100}:([^@/\\s]{3,100})@[^\\s/]+`,
      "d"
    ),
    // Require a digit AND entropy >= 2.5 to reject common word-only placeholders
    // like "password", "changeme", "PLACEHOLDER" (no digit fails immediately).
    validate(captured: string): boolean {
      try {
        return /\d/.test(captured) && shannonEntropy(captured) >= 2.5;
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

// ── Generic high-entropy detector ───────────────────────────────────────────
// Tokenizes candidate substrings using a BOUNDED regex (20–120 chars) then
// applies entropy floors and cheap noise filters. Born-redacted: only
// {ruleId, severity, index, length} are emitted, never the token value.

const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 120;
const MAX_TOKENS = 1000;

// Bounded tokenizer — no windowing, tokens longer than MAX_TOKEN_LENGTH are
// simply not matched (the upper bound is part of the regex quantifier).
// NOTE: '-' is included in the charset, so a dashed UUID or a "sha512-<hash>"
// string matches as ONE token (starting at 's' or the first dash-adjacent char),
// not as separate segments. Noise filters below handle both cases explicitly.
const TOKEN_RE = /[A-Za-z0-9+/=_-]{20,120}/g;

// Hex-only charset: 0-9 a-f A-F.
const HEX_RE = /^[0-9a-fA-F]+$/;

// git SHA (40 or 64 hex chars, exact length match).
const GIT_SHA_RE = /^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$/;

// Canonical dashed UUID: 8-4-4-4-12 hex groups separated by dashes (36 chars total).
// Because TOKEN_RE includes '-', a dashed UUID matches as one 36-char token.
// Its Shannon entropy is ~3.4 bits/char — below the 4.5 base64 floor — so it
// would be dropped anyway, but we add an explicit guard so the behaviour is
// correct-by-design, not by entropy coincidence.
const DASHED_UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Lockfile integrity hashes: TOKEN_RE includes '-', so "sha512-<base64hash>"
// matches as ONE token whose value starts with "sha512-". The guard therefore
// tests the TOKEN ITSELF (not the source text before it).
const LOCKFILE_TOKEN_RE = /^sha(?:512|384|256)-/;

function detectGenericEntropy(input: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  let tokenCount = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  try {
    while ((m = TOKEN_RE.exec(input)) !== null) {
      if (tokenCount >= MAX_TOKENS) break;
      tokenCount++;

      const token = m[0];
      const idx = m.index;

      // Length bounds already enforced by regex quantifier {20,120}, but
      // double-check to be defensive (belt-and-suspenders).
      if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) continue;

      // ── Noise filter 1: git SHA (40 or 64 pure hex) ──────────────────────
      if (GIT_SHA_RE.test(token)) continue;

      // ── Noise filter 2: canonical dashed UUID (36-char 8-4-4-4-12 form) ──
      // TOKEN_RE includes '-', so the full dashed UUID matches as one token.
      // Dropped explicitly here; entropy (~3.4) would also drop it, but this
      // makes the behaviour correct-by-design rather than by coincidence.
      if (DASHED_UUID_RE.test(token)) continue;

      // ── Noise filter 3: lockfile sha512-/sha384-/sha256- hash ────────────
      // TOKEN_RE includes '-', so "sha512-<base64>" is ONE token starting with
      // "sha512-". Check the token itself, not the source text before it.
      if (LOCKFILE_TOKEN_RE.test(token)) continue;

      // ── Charset classification + entropy floor ───────────────────────────
      const isHex = HEX_RE.test(token);
      const entropy = shannonEntropy(token);

      if (isHex) {
        // Hex tokens: floor 3.0 bits/char, plus numeric penalty.
        // Count digit chars in a single pass (no lookahead).
        let digitCount = 0;
        for (let i = 0; i < token.length; i++) {
          const c = token.charCodeAt(i);
          if (c >= 48 && c <= 57) digitCount++;
        }
        const digitRatio = digitCount / token.length;
        // Penalise heavily numeric hex strings (e.g. "12345678901234567890"
        // has high digit ratio but low information density vs a real key).
        const penalisedEntropy = entropy - digitRatio * 0.5;
        if (penalisedEntropy < 3.0) continue;
      } else {
        // Base64/mixed charset: floor 4.5 bits/char.
        if (entropy < 4.5) continue;
      }

      findings.push({ ruleId: "secret-generic-entropy", severity: "low", index: idx, length: token.length });
    }
  } finally {
    // Always reset lastIndex — a mid-loop throw would otherwise leave TOKEN_RE
    // in a dirty state that corrupts the next call's scan position.
    TOKEN_RE.lastIndex = 0;
  }
  return findings;
}

export function detectSecrets(text: string, _filePath?: string): SecretFinding[] {
  const input = text.slice(0, MAX_SECRET_SCAN_LENGTH);
  const findings: SecretFinding[] = [];

  for (const rule of PROVIDER_RULES) {
    // Preserve `d` (hasIndices) and `i` flags from the source regex; always add `g`.
    const srcFlags = rule.regex.flags;
    const addedFlags = "g" + (srcFlags.includes("i") ? "i" : "") + (srcFlags.includes("d") ? "d" : "");
    const gRegex = new RegExp(rule.regex.source, addedFlags);
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

      // Use m.indices[1] (from `d` flag) for the exact group-1 start offset.
      // This is correct even when the captured group text also appears earlier
      // in the full match (e.g. redis://xyz:xyz@h — username == password).
      // Fall back to indexOf for regexes that don't carry the `d` flag.
      let index: number;
      if (m[1] !== undefined && (m as RegExpExecArray & { indices?: [number, number][] }).indices?.[1] !== undefined) {
        index = ((m as RegExpExecArray & { indices: [number, number][] }).indices[1])[0];
      } else {
        index = m.index + (m[1] !== undefined ? fullMatch.indexOf(captured) : 0);
      }
      findings.push({
        ruleId: rule.ruleId,
        severity: rule.severity,
        index,
        length: captured.length,
      });
    }
  }

  // NOTE: a provider-matched high-entropy span may also yield a
  // secret-generic-entropy:low finding for the same byte range.
  // The critical/high provider finding dominates the action path; dedup
  // (when needed) is by (ruleId, index) — callers should not assume
  // findings are non-overlapping across rule IDs.
  try {
    const genericFindings = detectGenericEntropy(input);
    findings.push(...genericFindings);
  } catch {
    // detectGenericEntropy must not propagate — fail open
  }

  return findings;
}
