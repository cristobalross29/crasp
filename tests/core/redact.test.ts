import { describe, it, expect } from "vitest";
import { redactCommand } from "../../src/core/scanner/redact.js";

describe("redactCommand", () => {
  // Existing patterns — regression
  it("redacts sk- tokens (regression)", () => {
    const out = redactCommand("echo sk-abcdefghijklmnopqrstuvwxyz");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts github_pat_ tokens (regression)", () => {
    const out = redactCommand("git clone https://github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ@github.com/foo/bar");
    expect(out).not.toContain("github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  });

  it("leaves harmless commands unchanged (regression)", () => {
    expect(redactCommand("rm -rf build")).toBe("rm -rf build");
    expect(redactCommand("echo hello")).toBe("echo hello");
    expect(redactCommand("ls -la")).toBe("ls -la");
  });

  // FIX 1: curl -u basic auth
  it("redacts curl -u user:pass basic auth", () => {
    const out = redactCommand("curl -u alice:SuperSecret123 https://api.example.com");
    expect(out).not.toContain("SuperSecret123");
    expect(out).toContain("alice");
  });

  it("redacts curl --user user:pass basic auth", () => {
    const out = redactCommand("curl --user bob:MyP@ssw0rd https://api.example.com");
    expect(out).not.toContain("MyP@ssw0rd");
    expect(out).toContain("bob");
  });

  // FIX 1: URL userinfo credentials
  it("redacts password in URL userinfo (postgres://)", () => {
    const out = redactCommand('psql "postgres://admin:S3cr3tPassw0rd@db/prod"');
    expect(out).not.toContain("S3cr3tPassw0rd");
    expect(out).toContain("admin");
  });

  it("redacts password in URL userinfo (https://)", () => {
    const out = redactCommand("curl https://user:HiddenPass@example.com/api");
    expect(out).not.toContain("HiddenPass");
    expect(out).toContain("user");
  });

  // FIX 1: Secret env assignments
  it("redacts AWS_SECRET_ACCESS_KEY env assignment", () => {
    const out = redactCommand("AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY true");
    expect(out).not.toContain("wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY");
  });

  it("redacts export STRIPE_SECRET_KEY assignment", () => {
    const out = redactCommand("export STRIPE_SECRET_KEY=sk_live_ABCDEF1234567890abcdef");
    expect(out).not.toContain("sk_live_ABCDEF1234567890abcdef");
  });

  it("redacts DATABASE_PASSWORD env assignment", () => {
    const out = redactCommand("DATABASE_PASSWORD=hunter2 ./start.sh");
    expect(out).not.toContain("hunter2");
  });

  it("redacts API_KEY env assignment", () => {
    const out = redactCommand("MY_API_KEY=abc123secretval node index.js");
    expect(out).not.toContain("abc123secretval");
  });

  it("redacts quoted env assignment value", () => {
    const out = redactCommand('export DB_PASSWORD="my secret passphrase"');
    expect(out).not.toContain("my secret passphrase");
  });

  // FIX 1: Stripe keys
  it("redacts Stripe sk_live_ key in command", () => {
    const out = redactCommand("deploy --key sk_live_ABCDEF1234567890abcdef");
    expect(out).not.toContain("sk_live_ABCDEF1234567890abcdef");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts Stripe sk_test_ key", () => {
    const out = redactCommand("node charge.js sk_test_ABCDEF1234567890abcdef");
    expect(out).not.toContain("sk_test_ABCDEF1234567890abcdef");
  });

  it("redacts Stripe rk_live_ key", () => {
    const out = redactCommand("node app.js rk_live_ABCDEF1234567890abcdef");
    expect(out).not.toContain("rk_live_ABCDEF1234567890abcdef");
  });

  // FIX 1: GitLab PAT
  it("redacts GitLab PAT (glpat-)", () => {
    const out = redactCommand("deploy --token glpat-ABCDEFGHIJ1234567890xy");
    expect(out).not.toContain("glpat-ABCDEFGHIJ1234567890xy");
    expect(out).toContain("[REDACTED]");
  });

  // FIX 1: Google API key
  it("redacts Google API key (AIza...)", () => {
    // Google API keys: AIza + exactly 35 alphanumeric/dash/underscore chars = 39 total.
    // Built by concatenation so no contiguous key-shaped literal exists in source
    // (avoids tripping GitHub secret scanning on this synthetic fixture).
    const key = "AIza" + "SyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456";
    const out = redactCommand(`curl "https://maps.googleapis.com/maps/api?key=${key}"`);
    expect(out).not.toContain(key);
    expect(out).toContain("[REDACTED]");
  });

  // FIX 1: PEM private key material
  it("redacts PEM OPENSSH PRIVATE KEY block body", () => {
    const cmd = "printf -- '-----BEGIN OPENSSH PRIVATE KEY-----\\nb3BlbnNzaABCDEFkey\\n-----END OPENSSH PRIVATE KEY-----'";
    const out = redactCommand(cmd);
    expect(out).not.toContain("b3BlbnNzaABCDEFkey");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts PEM RSA PRIVATE KEY block body", () => {
    const cmd = "cat /tmp/key | openssl rsa\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAsecretdata\n-----END RSA PRIVATE KEY-----";
    const out = redactCommand(cmd);
    expect(out).not.toContain("MIIEowIBAAKCAQEAsecretdata");
    expect(out).toContain("[REDACTED]");
  });

  // MED 5: colon-form secret assignments (e.g. in a URL query or WebSearch text)
  it("redacts colon-form client_secret", () => {
    const out = redactCommand("client_secret: abc123def456ghi789jkl");
    expect(out).not.toContain("abc123def456ghi789jkl");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts colon-form api_key in a URL-ish target", () => {
    const out = redactCommand("(WebSearch: lookup api_key:sk-livetoken1234567890abcdef)");
    expect(out).not.toContain("sk-livetoken1234567890abcdef");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts colon-form access_token (case-insensitive)", () => {
    const out = redactCommand("Access_Token : MyVerySecretAccessToken123");
    expect(out).not.toContain("MyVerySecretAccessToken123");
  });

  it("redacts colon-form password", () => {
    const out = redactCommand("password: hunter2supersecret");
    expect(out).not.toContain("hunter2supersecret");
  });

  // MED 5: bearer tokens in a target/URL
  it("redacts a bearer token", () => {
    const out = redactCommand("curl -H 'Authorization: Bearer abc123XYZ_secret-token'");
    expect(out).not.toContain("abc123XYZ_secret-token");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a lowercase bearer token", () => {
    const out = redactCommand("authorization: bearer eyAbCdEfGhIjKlMnOp123456");
    expect(out).not.toContain("eyAbCdEfGhIjKlMnOp123456");
  });

  it("does not redact a too-short bearer-like word", () => {
    // "bearer of" — the trailing word is short and not a token; leave unchanged.
    expect(redactCommand("the bearer of bad news")).toBe("the bearer of bad news");
  });

  // LOW/MED 3: a `bearer <token>` preceded by an `=`/colon assignment must NOT
  // leak — the assignment pattern used to consume the word "bearer" as the value
  // (stopping at the space), so the real token escaped. Bearer redaction now runs
  // first.
  it("redacts a bearer token preceded by an = assignment (token=bearer …)", () => {
    const out = redactCommand("token=bearer ABCDEF1234567890");
    expect(out).not.toContain("ABCDEF1234567890");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a bearer token preceded by auth= assignment", () => {
    const out = redactCommand("auth=bearer XYZ12345");
    expect(out).not.toContain("XYZ12345");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts an authorization: bearer header form", () => {
    const out = redactCommand("authorization: bearer ABCDEFGH12345678");
    expect(out).not.toContain("ABCDEFGH12345678");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a plain bearer token", () => {
    const out = redactCommand("bearer PlainTokenValue123456");
    expect(out).not.toContain("PlainTokenValue123456");
    expect(out).toContain("[REDACTED]");
  });

  it("does not mangle 'the-bearer-of-bad-news'", () => {
    expect(redactCommand("the-bearer-of-bad-news")).toBe("the-bearer-of-bad-news");
  });

  it("does not mangle a too-short bearer token (under 8 chars)", () => {
    expect(redactCommand("bearer x")).toBe("bearer x");
  });

  // Idempotency
  it("is idempotent on a curl -u case", () => {
    const cmd = "curl -u alice:SuperSecret123 https://api.example.com";
    expect(redactCommand(redactCommand(cmd))).toBe(redactCommand(cmd));
  });

  it("is idempotent on a glpat- case", () => {
    const cmd = "deploy --token glpat-ABCDEFGHIJ1234567890xy";
    expect(redactCommand(redactCommand(cmd))).toBe(redactCommand(cmd));
  });

  // ReDoS safety — 50KB input completes in <100ms
  it("handles a 50KB command within 100ms (ReDoS safety)", () => {
    const big = "curl -u alice:pass " + "x".repeat(50_000);
    const t0 = performance.now();
    redactCommand(big);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  // MED 5: ReDoS safety for the new colon-form + bearer patterns.
  it("handles a whitespace-flooded colon-form within 100ms (ReDoS safety)", () => {
    const big = "client_secret" + " ".repeat(200_000) + ": " + "x".repeat(50_000);
    const t0 = performance.now();
    redactCommand(big);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("handles a whitespace-flooded bearer within 100ms (ReDoS safety)", () => {
    const big = "bearer" + " ".repeat(200_000) + "x".repeat(50_000);
    const t0 = performance.now();
    redactCommand(big);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
