import { describe, it, expect } from "vitest";
import {
  maskSpan,
  maskSpanInLine,
  detectSecrets,
} from "../../src/core/scanner/secrets.js";

describe("maskSpan", () => {
  it("masks the middle of a span, keeping 4 ends", () => {
    const t = "key=sk-ABCDEFGHIJKLMNOP1234";
    expect(maskSpan(t, 4, t.length - 4)).toMatch(/^sk-A\.\.\.\[REDACTED\]\.\.\.1234$/);
  });

  it("returns [REDACTED] for spans of 8 chars or fewer", () => {
    const t = "key=short";
    expect(maskSpan(t, 4, 5)).toBe("[REDACTED]");
  });

  it("returns [REDACTED] for spans of exactly 8 chars", () => {
    const t = "key=12345678";
    expect(maskSpan(t, 4, 8)).toBe("[REDACTED]");
  });

  it("masks only the extracted span, ignoring surrounding text", () => {
    const t = "prefix sk-ABCDEFGHIJKLMNOP1234 suffix";
    const start = 7;
    const len = 24;
    const result = maskSpan(t, start, len);
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("prefix");
    expect(result).not.toContain("suffix");
  });

  it("masks a span starting at index 0", () => {
    const t = "sk-ABCDEFGHIJKLMNOP1234 rest";
    const result = maskSpan(t, 0, 23);
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("rest");
  });

  it("masks a span at the end of the text", () => {
    const t = "start sk-ABCDEFGHIJKLMNOP1234";
    const len = 23;
    const start = t.length - len;
    const result = maskSpan(t, start, len);
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).not.toContain("start");
  });
});

describe("maskSpanInLine", () => {
  it("masks a span that is fully on the target line", () => {
    const text = "line one\nkey=sk-ABCDEFGHIJKLMNOP1234\nline three";
    const lineStart = "line one\n".length;
    const secretStart = lineStart + 4;
    const secretLen = 23;
    const result = maskSpanInLine(text, secretStart, secretLen, 1);
    expect(result).toContain("key=");
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("line one");
    expect(result).not.toContain("line three");
  });

  it("returns the line with [REDACTED] for short span", () => {
    const text = "first\nABC=short\nthird";
    const lineStart = "first\n".length;
    const secretStart = lineStart + 4;
    const secretLen = 5;
    const result = maskSpanInLine(text, secretStart, secretLen, 1);
    expect(result).toContain("ABC=");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("short");
  });

  it("works on the first line (line 0)", () => {
    const text = "sk-ABCDEFGHIJKLMNOP1234\nother";
    const result = maskSpanInLine(text, 0, 23, 0);
    expect(result).not.toContain("ABCDEFGHIJKLMNOP");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("other");
  });
});

// Positive samples: one real-looking token per provider
const POS: Array<[string, string]> = [
  // AWS AKIA key id — 20-char uppercase+digit
  ["secret-aws-akia", "AKIAIOSFODNN7EXAMPLE"],
  // Anthropic sk-ant-api03 — exactly 93 mixed chars + AA suffix (= 95 chars total after prefix)
  ["secret-anthropic", "sk-ant-api03-aB3dEf7hIjKlMnOpQrStUvWxYz0123456789aB3dEf7hIjKlMnOpQrStUvWxYz0123456789aB3dEf7hIjKlMnOpQrStUAA"],
  // Stripe live secret key
  ["secret-stripe", "sk_live_" + "aB3dEf7hIjKlMnOpQrStUvWx"],
  // GitHub PAT (ghp_ prefix)
  ["secret-github", "ghp_" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789"],
  // Google API key
  ["secret-google-api", "AIza" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456Xy"],
  // DB connection string with embedded password
  ["secret-db-conn", "postgres://user:p4ssw0rd@db.internal:5432/app"],
  // OpenAI proj — T3BlbkFJ marker (base64 of "OpenAI"), 58 chars on each side
  ["secret-openai", "sk-proj-" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789aB3dEfGhIjKlMnOpQrStUvW" + "T3BlbkFJ" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789aB3dEfGhIjKlMnOpQrStUvW"],
  // GitHub PAT (gho_ prefix)
  ["secret-github", "gho_" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789"],
  // GitHub PAT (ghs_ prefix)
  ["secret-github", "ghs_" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789"],
  // GitHub PAT (ghu_ prefix)
  ["secret-github", "ghu_" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789"],
  // GitHub long-form PAT — exactly 82 chars after "github_pat_"
  ["secret-github", "github_pat_" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789aB3dEfGhIjKlMnOpQrStUvWxYz01234567890123456789"],
  // Stripe rk_live
  ["secret-stripe", "rk_live_" + "aB3dEf7hIjKlMnOpQrStUvWx"],
  // Stripe test key
  ["secret-stripe", "sk_test_" + "aB3dEf7hIjKlMnOpQrStUvWx"],
  // Stripe webhook secret
  ["secret-stripe-webhook", "whsec_" + "aB3dEf7hIjKlMnOpQrStUvWxYz012345"],
  // GitLab PAT
  ["secret-gitlab", "glpat-" + "aB3dEfGhIjKlMnOpQrSt"],
  // Google OAuth client secret — exactly 28 chars after "GOCSPX-"
  ["secret-google-oauth", "GOCSPX-" + "aB3dEfGhIjKlMnOpQrStUvWxYz01"],
  // Azure client secret (Q~ infix)
  ["secret-azure", "Q~aB3dEfGhIjKlMnOpQrStUvWxYz012345678"],
  // Slack bot token
  ["secret-slack", "xoxb-" + "1234567890-" + "1234567890123-" + "aB3dEfGhIjKlMnOpQrStUvWx"],
  // Slack webhook URL
  ["secret-slack-webhook", "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"],
  // SendGrid
  ["secret-sendgrid", "SG." + "aB3dEfGhIjKlMnOpQrSt" + "." + "aB3dEfGhIjKlMnOpQrStUvWxYz01234567"],
  // Twilio account SID — AC + 32 lowercase hex chars
  ["secret-twilio", "AC" + "0123456789abcdef0123456789abcdef"],
  // Twilio API key — SK + 32 lowercase hex chars
  ["secret-twilio", "SK" + "fedcba9876543210fedcba9876543210"],
  // HuggingFace token
  ["secret-huggingface", "hf_" + "aB3dEfGhIjKlMnOpQrStUvWxYz012345678"],
  // npm token
  ["secret-npm", "npm_" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789"],
  // PyPI token
  ["secret-pypi", "pypi-" + "AgEIcHlwaS5vcmcCJGFiM2RlZmdo"],
  // PEM private key header + long body
  ["secret-pem", "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123"],
  // SSH private key header + long body
  ["secret-pem", "-----BEGIN OPENSSH PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123"],
  // DigitalOcean personal access token — dop_v1_ + 64 lowercase hex
  ["secret-digitalocean", "dop_v1_" + "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
  // Datadog API key — DD + 32 hex chars (only 0-9, a-f valid)
  ["secret-datadog", "DD" + "0123456789abcdef0123456789abcdef"],
  // Cloudflare API token
  ["secret-cloudflare", "cf_" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789"],
  // Shopify access token — shpat_ + 32 hex chars
  ["secret-shopify", "shpat_" + "0123456789abcdef0123456789abcdef"],
  // Square access token
  ["secret-square", "EAAAl" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789aB3dEfGh"],
];

describe("detectSecrets — provider detection", () => {
  it.each(POS)("detects %s", (ruleId, sample) => {
    const ids = detectSecrets(`x = "${sample}"`).map((f) => f.ruleId);
    expect(ids).toContain(ruleId);
  });

  it("does not match a placeholder (entropy filter)", () => {
    expect(
      detectSecrets('key = "sk_live_PLACEHOLDER"').filter((f) => f.severity === "critical")
    ).toHaveLength(0);
  });

  it("does not match sk_live_ with too-short suffix", () => {
    expect(
      detectSecrets('key = "sk_live_abc"').filter((f) => f.ruleId === "secret-stripe")
    ).toHaveLength(0);
  });

  it("findings never carry the raw value", () => {
    const f = detectSecrets('k="AKIAIOSFODNN7EXAMPLE"')[0];
    expect(f).toBeDefined();
    expect(Object.values(f)).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("AWS AKIA finding has severity critical", () => {
    const findings = detectSecrets('k="AKIAIOSFODNN7EXAMPLE"');
    const aws = findings.find((f) => f.ruleId === "secret-aws-akia");
    expect(aws?.severity).toBe("critical");
  });

  it("JWT finding has severity medium", () => {
    // Well-formed 3-part JWT with valid base64url JSON header + payload
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "1234567890", name: "Test" })).toString("base64url");
    const jwt = `${header}.${payload}.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`;
    const findings = detectSecrets(`token = "${jwt}"`);
    const jwtFinding = findings.find((f) => f.ruleId === "secret-jwt");
    expect(jwtFinding?.severity).toBe("medium");
  });

  it("JWT validate is total — malformed JWT does not throw", () => {
    expect(() => detectSecrets('t = "not.a.jwt"')).not.toThrow();
    expect(() => detectSecrets('t = "bad!!!.bad!!!.bad!!!"')).not.toThrow();
  });

  it("db connection string fires critical", () => {
    const findings = detectSecrets("mysql://admin:S3cr3tP4ss@db.example.com:3306/prod");
    const db = findings.find((f) => f.ruleId === "secret-db-conn");
    expect(db?.severity).toBe("critical");
  });

  it("db connection string with no password does not fire", () => {
    expect(
      detectSecrets("postgres://db.example.com/app").filter((f) => f.ruleId === "secret-db-conn")
    ).toHaveLength(0);
  });

  it("PEM header without long body does not fire", () => {
    expect(
      detectSecrets("-----BEGIN RSA PRIVATE KEY-----\nshort\n-----END RSA PRIVATE KEY-----").filter(
        (f) => f.ruleId === "secret-pem"
      )
    ).toHaveLength(0);
  });

  it("returns only {ruleId, severity, index, length} fields", () => {
    const findings = detectSecrets('k="AKIAIOSFODNN7EXAMPLE"');
    for (const f of findings) {
      const keys = Object.keys(f).sort();
      expect(keys).toEqual(["index", "length", "ruleId", "severity"]);
    }
  });

  it("slices input to MAX_SECRET_SCAN_LENGTH (1_000_000)", () => {
    const bigInput = "A".repeat(2_000_000) + 'AKIAIOSFODNN7EXAMPLE';
    expect(() => detectSecrets(bigInput)).not.toThrow();
    // The AKIA key is beyond the cap so should NOT fire
    const ids = detectSecrets(bigInput).map((f) => f.ruleId);
    expect(ids).not.toContain("secret-aws-akia");
  });

  it("handles empty string without error", () => {
    expect(detectSecrets("")).toEqual([]);
  });

  it("handles string shorter than any token without error", () => {
    expect(() => detectSecrets("hello world")).not.toThrow();
  });
});

describe("Fix 1 — secret-url-creds: generic URL-embedded credentials", () => {
  it("detects https://user:password@host", () => {
    const text = "endpoint = https://admin:s3cr3t1@example.com/api";
    const ids = detectSecrets(text).map((f) => f.ruleId);
    expect(ids).toContain("secret-url-creds");
  });

  it("has severity critical", () => {
    const findings = detectSecrets("https://admin:s3cr3t1@example.com");
    const f = findings.find((r) => r.ruleId === "secret-url-creds");
    expect(f?.severity).toBe("critical");
  });

  it("finding index points at the password, not the username", () => {
    const text = "https://admin:s3cr3t1@example.com";
    const findings = detectSecrets(text);
    const f = findings.find((r) => r.ruleId === "secret-url-creds");
    expect(f).toBeDefined();
    const extracted = text.slice(f!.index, f!.index + f!.length);
    expect(extracted).toBe("s3cr3t1");
  });

  it("rejects obvious placeholder passwords", () => {
    const findings = detectSecrets("https://user:password@example.com");
    expect(findings.filter((f) => f.ruleId === "secret-url-creds")).toHaveLength(0);
  });

  it("rejects 'user:password' placeholder with no digits", () => {
    const findings = detectSecrets("https://user:changeme@example.com");
    expect(findings.filter((f) => f.ruleId === "secret-url-creds")).toHaveLength(0);
  });

  it("does not duplicate hits already caught by secret-db-conn (named schemes)", () => {
    const text = "postgres://user:p4ssw0rd@db.internal:5432/app";
    const findings = detectSecrets(text);
    const urlCreds = findings.filter((f) => f.ruleId === "secret-url-creds");
    const dbConn = findings.filter((f) => f.ruleId === "secret-db-conn");
    expect(dbConn).toHaveLength(1);
    expect(urlCreds).toHaveLength(0);
  });

  it("near-miss: no credentials in URL does not fire", () => {
    expect(
      detectSecrets("https://example.com/path?q=1").filter((f) => f.ruleId === "secret-url-creds")
    ).toHaveLength(0);
  });

  it("near-miss: ftp:// with placeholder password does not fire", () => {
    expect(
      detectSecrets("ftp://user:PLACEHOLDER@example.com").filter((f) => f.ruleId === "secret-url-creds")
    ).toHaveLength(0);
  });
});

describe("Fix 2 — secret-openai: T3BlbkFJ marker required for proj/svcacct/admin variants", () => {
  it("detects a sk-proj- key that contains the T3BlbkFJ marker", () => {
    const key =
      "sk-proj-" +
      "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789aB3dEfGhIjKlMnOpQrStUvW" +
      "T3BlbkFJ" +
      "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789aB3dEfGhIjKlMnOpQrStUvW";
    const ids = detectSecrets(`key = "${key}"`).map((f) => f.ruleId);
    expect(ids).toContain("secret-openai");
  });

  it("does NOT match sk-proj- without the T3BlbkFJ marker", () => {
    const bareKey = "sk-proj-" + "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789aB3dEfGhIjKlMnOpQrStUvWxYz01234";
    const findings = detectSecrets(`key = "${bareKey}"`).filter((f) => f.ruleId === "secret-openai");
    expect(findings).toHaveLength(0);
  });

  it("still matches legacy sk- key (no proj prefix, has marker in body)", () => {
    const legacyKey = "sk-" + "aB3dEfGhIjKlMnOpQrSt1234";
    const ids = detectSecrets(`key = "${legacyKey}"`).map((f) => f.ruleId);
    expect(ids).toContain("secret-openai");
  });
});

describe("Fix 4 (round-2) — secret-db-conn: OR gate (digit OR high-entropy)", () => {
  it("FIRES for high-entropy digit-free password: mongodb://admin:WinterIsComing@h", () => {
    const findings = detectSecrets("mongodb://admin:WinterIsComing@h");
    const f = findings.find((r) => r.ruleId === "secret-db-conn");
    expect(f).toBeDefined();
  });

  it("FIRES for digit-bearing password: redis://u:p4ss1@h", () => {
    const findings = detectSecrets("redis://u:p4ss1@h");
    const f = findings.find((r) => r.ruleId === "secret-db-conn");
    expect(f).toBeDefined();
  });

  it("does NOT fire for placeholder 'password' (no digit, entropy < 3.0): mysql://user:password@localhost", () => {
    const findings = detectSecrets("mysql://user:password@localhost");
    expect(findings.filter((f) => f.ruleId === "secret-db-conn")).toHaveLength(0);
  });
});

describe("generic entropy detector (secret-generic-entropy)", () => {
  it("flags a random base64 blob as generic entropy (advisory)", () => {
    const blob = "Zk9wQ3hLmnP4vR7tY2uX8wB1nM6kJ3hG5fD0sA9qWeRtY";
    const f = detectSecrets(`token = "${blob}"`).find(x => x.ruleId === "secret-generic-entropy");
    expect(f?.severity).toBe("low");
  });

  it("does NOT flag a git SHA, UUID, or lockfile hash", () => {
    for (const s of ["a".repeat(40), "550e8400-e29b-41d4-a716-446655440000",
                     "sha512-" + "A".repeat(80)]) {
      expect(detectSecrets(`x="${s}"`).some(f => f.ruleId === "secret-generic-entropy")).toBe(false);
    }
  });

  it("terminates on 64k tiny tokens and one giant token (bounds)", () => {
    expect(() => detectSecrets(("aA1 ".repeat(64000)))).not.toThrow();
    expect(() => detectSecrets("x".repeat(2_000_000))).not.toThrow();
  });

  // Fix 1: realistic high-entropy lockfile hash must not fire
  it("does NOT flag a realistic high-entropy sha512 lockfile hash", () => {
    // This token starts with "sha512-" followed by a real base64 hash — entropy well above 4.5.
    // The old prefix-before-token guard failed because TOKEN_RE includes '-', so the entire
    // "sha512-<hash>" string matches as one token starting at 's', not at the base64 content.
    const lockfileHash = "sha512-Zk9wQ3hLmnP4vR7tY2uX8wB1nM6kJ3hG5fD0sA9qWeRtYuIoPasSdFgHjKlZxCvBnM+Qw==";
    expect(
      detectSecrets(`"integrity": "${lockfileHash}"`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  // Fix 2: canonical dashed UUID must not fire (explicit design guard, not entropy coincidence)
  it("does NOT flag a dashed UUID (explicit UUID guard, not entropy coincidence)", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      detectSecrets(`id = "${uuid}"`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });
});

describe("Task 8 — precision package (path/ext skip, hash-prefix gate, noise denylist)", () => {
  const HIGH_ENTROPY_BLOB = "Zk9wQ3hLmnP4vR7tY2uX8wB1nM6kJ3hG5fD0sA9qWeRtY";

  // ── Path/extension skip ──────────────────────────────────────────────────

  it("no generic entropy on pnpm-lock.yaml", () => {
    expect(
      detectSecrets(`"integrity": "${HIGH_ENTROPY_BLOB}"`, "pnpm-lock.yaml")
        .some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("no generic entropy on package-lock.json", () => {
    expect(
      detectSecrets(`"integrity": "${HIGH_ENTROPY_BLOB}"`, "/project/package-lock.json")
        .some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("no generic entropy on a *.min.js file", () => {
    expect(
      detectSecrets(`var x="${HIGH_ENTROPY_BLOB}"`, "/dist/bundle.min.js")
        .some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("no generic entropy on a *.map file", () => {
    expect(
      detectSecrets(`{"mappings":"${HIGH_ENTROPY_BLOB}"}`, "app.js.map")
        .some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("no generic entropy on a *.snap file", () => {
    expect(
      detectSecrets(`exports[\`x 1\`] = \`${HIGH_ENTROPY_BLOB}\`;`, "tests/__snapshots__/foo.test.ts.snap")
        .some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("providers STILL fire on pnpm-lock.yaml (AKIA key is a real leak)", () => {
    const content = `resolved "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz#abc123"\nAKIAIOSFODNN7EXAMPLE`;
    const findings = detectSecrets(content, "pnpm-lock.yaml");
    expect(findings.some(f => f.ruleId === "secret-aws-akia")).toBe(true);
    expect(findings.some(f => f.ruleId === "secret-generic-entropy")).toBe(false);
  });

  it("providers STILL fire on a *.min.js file", () => {
    const content = `var k="AKIAIOSFODNN7EXAMPLE";`;
    const findings = detectSecrets(content, "bundle.min.js");
    expect(findings.some(f => f.ruleId === "secret-aws-akia")).toBe(true);
    expect(findings.some(f => f.ruleId === "secret-generic-entropy")).toBe(false);
  });

  // ── Per-line hash-prefix gate ────────────────────────────────────────────

  it("does NOT flag a token on an integrity= line (HTML SRI)", () => {
    const line = `<link rel="stylesheet" integrity="sha384-${HIGH_ENTROPY_BLOB}" crossorigin="anonymous">`;
    expect(
      detectSecrets(line).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("does NOT flag a token on a resolved line (pnpm lockfile yaml)", () => {
    const line = `    resolved "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz#${HIGH_ENTROPY_BLOB}"`;
    expect(
      detectSecrets(line).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("does NOT flag a token on a sha256: line (docker digest)", () => {
    const line = `digest: sha256:${HIGH_ENTROPY_BLOB}abc`;
    expect(
      detectSecrets(line).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("does NOT flag a token on a h1: line (go.sum)", () => {
    const line = `github.com/pkg/errors v0.9.1 h1:${HIGH_ENTROPY_BLOB}=`;
    expect(
      detectSecrets(line).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("still flags a high-entropy token on a normal line (no hash-prefix keywords)", () => {
    expect(
      detectSecrets(`token = "${HIGH_ENTROPY_BLOB}"`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(true);
  });

  // ── Noise denylist ───────────────────────────────────────────────────────

  it("does NOT flag a dashless UUID (32 hex chars)", () => {
    const dashless = "550e8400e29b41d4a716446655440000";
    expect(
      detectSecrets(`id = "${dashless}"`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("does NOT flag a base32 string (uppercase A-Z + 2-7, 24+ chars)", () => {
    const base32 = "JBSWY3DPEBLW64TMMQQQ2YLSMQQQ";
    expect(
      detectSecrets(`code = "${base32}"`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("does NOT flag an IPv6 literal", () => {
    const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
    expect(
      detectSecrets(`addr = "${ipv6}"`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("does NOT flag an HTML hex color run (repeated hex color codes)", () => {
    const colorHex = "#1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
    expect(
      detectSecrets(`color: ${colorHex};`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("does NOT flag the jwt.io sample JWT (known dummy payload)", () => {
    const jwtIoSample =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(
      detectSecrets(`token = "${jwtIoSample}"`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });

  it("does NOT flag a docker sha256 digest", () => {
    const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    expect(
      detectSecrets(`image: nginx@${digest}`).some(f => f.ruleId === "secret-generic-entropy")
    ).toBe(false);
  });
});

describe("Fix 3 — secret-db-conn: index offset points at password, not username", () => {
  // Use abc123 as user==password: has a digit, entropy ~2.58 — passes validate.
  // The old indexOf approach returns the USERNAME offset (first occurrence of "abc123"),
  // not the PASSWORD offset (second occurrence). The d-flag fix returns the correct one.
  it("index points at password when username == password (redis://abc123:abc123@host)", () => {
    const text = "redis://abc123:abc123@host";
    const findings = detectSecrets(text);
    const f = findings.find((r) => r.ruleId === "secret-db-conn");
    expect(f).toBeDefined();
    const extracted = text.slice(f!.index, f!.index + f!.length);
    expect(extracted).toBe("abc123");
    // Password starts after the second colon (position 15), not after the first (position 7)
    const secondColonPos = text.indexOf(":", text.indexOf(":") + 1);
    expect(f!.index).toBe(secondColonPos + 1);
  });

  it("index points at password for postgres://user:pass@host", () => {
    const text = "postgres://user:p4ssw0rd@db.internal:5432/app";
    const findings = detectSecrets(text);
    const f = findings.find((r) => r.ruleId === "secret-db-conn");
    expect(f).toBeDefined();
    const extracted = text.slice(f!.index, f!.index + f!.length);
    expect(extracted).toBe("p4ssw0rd");
  });

  it("length matches the actual password length", () => {
    const text = "mysql://admin:S3cr3tP4ss@db.example.com:3306/prod";
    const findings = detectSecrets(text);
    const f = findings.find((r) => r.ruleId === "secret-db-conn");
    expect(f).toBeDefined();
    expect(f!.length).toBe("S3cr3tP4ss".length);
  });

  it("finding does not contain the raw password value", () => {
    const text = "redis://abc123:abc123@host";
    const findings = detectSecrets(text);
    const f = findings.find((r) => r.ruleId === "secret-db-conn");
    expect(f).toBeDefined();
    expect(Object.values(f!)).not.toContain("abc123");
  });
});
