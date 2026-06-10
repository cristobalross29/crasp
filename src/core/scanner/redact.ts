import type { FileScanMatch, FileScanResult } from "../../types/index.js";

export function redactSensitiveScanResults(
  results: FileScanResult[]
): FileScanResult[] {
  return results.map((result) => ({
    ...result,
    matches: result.matches.map(redactSensitiveMatch),
  }));
}

function redactSensitiveMatch(match: FileScanMatch): FileScanMatch {
  if (match.ruleId !== "token-leakage") return match;
  const redacted = redactSecret(match.match);
  return {
    ...match,
    match: redacted,
    context: match.context.replace(match.match, redacted),
  };
}

function redactSecret(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const assignment = normalized.match(/^([^=:]+[=:]\s*["']?)(.+?)(["']?)$/);
  if (assignment) {
    return `${assignment[1]}${redactValue(assignment[2])}${assignment[3]}`;
  }
  return redactValue(normalized);
}

function redactValue(value: string): string {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
}

// --- Token patterns: simple whole-match replacements, each regex is linear. ---
const SECRET_TOKEN_PATTERNS: RegExp[] = [
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  // Stripe secret/restricted keys (live + test)
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g,
  // GitLab PATs
  /glpat-[A-Za-z0-9_-]{20,}/g,
  // Google API keys (AIza + exactly 35 chars)
  /AIza[0-9A-Za-z_-]{35}/g,
];

// PEM private key blocks — lazy [\s\S]*? terminates at the matching END marker.
const PEM_PRIVATE_KEY_RE =
  /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g;

// curl -u user:pass and --user user:pass (curl basic auth).
// [^\s:@"']{1,128} for the username — no colon/space/@ inside, bounded length.
// [^\s@"']{1,256} for the password — stops at whitespace or @.
const CURL_BASIC_AUTH_RE =
  /(-u\s+[^\s:@"']{1,128}:|--user\s+[^\s:@"']{1,128}:)([^\s@"']{1,256})/g;

// Secret-named env assignments — two separate patterns to avoid backtracking.
//
// Pattern A: any NAME ending in _SECRETSUFFIX= (e.g. AWS_SECRET_ACCESS_KEY=).
// \b + {0,64} bound the name prefix — no unbounded backtracking on long strings.
const SECRET_SUFFIX_ENV_RE =
  /\b([A-Za-z_][A-Za-z0-9_]{0,64}_(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|AUTH)S?)=([^\s]{1,512})/gi;

// Pattern B: bare secret names (with optional export keyword).
// No underscore-prefix search so no character-class backtracking.
const BARE_SECRET_ENV_RE =
  /\b((?:export\s+)?(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|AUTH)S?)=([^\s]{1,512})/gi;

// URL userinfo: scheme://user:password@host
// Regex applied per-segment (split on @) to avoid catastrophic backtracking
// on large strings with no @ sign.
const URL_USERINFO_TAIL_RE =
  /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:@"'/]{1,128}:)([^\s@"']{1,512})$/;

function redactUrlUserinfo(command: string): string {
  // Fast path: no '@' → no URL credentials possible.
  if (!command.includes("@")) return command;

  const parts = command.split("@");
  for (let i = 0; i < parts.length - 1; i++) {
    const m = parts[i].match(URL_USERINFO_TAIL_RE);
    if (m) {
      parts[i] =
        parts[i].slice(0, parts[i].length - m[2].length) + redactValue(m[2]);
    }
  }
  return parts.join("@");
}

export function redactCommand(command: string): string {
  let out = command;

  // PEM blocks first — lazy quantifier terminates at the END marker.
  out = out.replace(PEM_PRIVATE_KEY_RE, (_, keyType: string) =>
    `-----BEGIN ${keyType}-----[REDACTED]-----END ${keyType}-----`
  );

  // Token patterns — each is a simple linear scan.
  for (const re of SECRET_TOKEN_PATTERNS) {
    out = out.replace(re, (m) => redactValue(m));
  }

  // URL userinfo — segment-based to stay linear on large strings.
  out = redactUrlUserinfo(out);

  // curl basic auth — bounded character classes, no backtracking.
  out = out.replace(
    CURL_BASIC_AUTH_RE,
    (_, prefix: string, password: string) =>
      `${prefix}${redactValue(password)}`
  );

  // Secret-named env assignments — two bounded patterns, each linear.
  const envReplacer = (_: string, name: string, value: string): string => {
    const stripped = value.replace(/^["']|["']$/g, "");
    return `${name}=${redactValue(stripped)}`;
  };
  out = out.replace(SECRET_SUFFIX_ENV_RE, envReplacer);
  out = out.replace(BARE_SECRET_ENV_RE, envReplacer);

  return out;
}
