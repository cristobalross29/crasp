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
    // Google API keys: AIza + exactly 35 alphanumeric/dash/underscore chars = 39 total
    const key = "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456";
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
});
