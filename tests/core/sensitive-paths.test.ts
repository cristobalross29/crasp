import { describe, expect, it } from "vitest";
import { checkSensitivePath } from "../../src/core/scanner/sensitive-paths.js";

describe("checkSensitivePath", () => {
  describe(".env files", () => {
    it("returns tier:high when writing to .env", () => {
      const result = checkSensitivePath("/project/.env", "Write");
      expect(result?.tier).toBe("high");
      expect(result?.ruleId).toBe("sensitive-env-file");
      expect(result?.message).toContain("⚠️");
      expect(result?.message).toContain(".env");
    });

    it("returns tier:high when writing to .env.local", () => {
      const result = checkSensitivePath("/project/.env.local", "Write");
      expect(result?.tier).toBe("high");
      expect(result?.message).toContain(".env.local");
    });

    it("returns tier:high when writing to .env.production.local", () => {
      const result = checkSensitivePath("/project/.env.production.local", "Write");
      expect(result?.tier).toBe("high");
    });

    it("returns tier:high when editing .env.local", () => {
      const result = checkSensitivePath("/project/.env.local", "Edit");
      expect(result?.tier).toBe("high");
    });

    it("returns tier:advisory when reading .env.local", () => {
      const result = checkSensitivePath("/project/.env.local", "Read");
      expect(result?.tier).toBe("advisory");
      expect(result?.ruleId).toBe("sensitive-env-file");
      expect(result?.message).toContain("AgentFence");
      expect(result?.message).toContain(".env.local");
    });

    it("allows .env.example (template)", () => {
      expect(checkSensitivePath("/project/.env.example", "Write")).toBeNull();
    });

    it("allows .env.sample (template)", () => {
      expect(checkSensitivePath("/project/.env.sample", "Write")).toBeNull();
    });

    it("allows .env.template (template)", () => {
      expect(checkSensitivePath("/project/.env.template", "Write")).toBeNull();
    });

    it("allows .env.dist (template)", () => {
      expect(checkSensitivePath("/project/.env.dist", "Write")).toBeNull();
    });
  });

  describe("cryptographic key files", () => {
    it("returns tier:critical when writing to a .pem file", () => {
      const result = checkSensitivePath("/certs/server.pem", "Write");
      expect(result?.tier).toBe("critical");
      expect(result?.ruleId).toBe("sensitive-key-file");
      expect(result?.message).toContain("🚨");
    });

    it("returns tier:critical when reading a .pem file", () => {
      const result = checkSensitivePath("/certs/server.pem", "Read");
      expect(result?.tier).toBe("critical");
      expect(result?.message).toContain("🚨");
    });

    it("returns tier:critical when writing to a .key file", () => {
      expect(checkSensitivePath("/certs/server.key", "Write")?.tier).toBe("critical");
    });

    it("returns tier:critical when writing to id_rsa", () => {
      expect(checkSensitivePath("/home/user/.ssh/id_rsa", "Write")?.tier).toBe("critical");
    });

    it("returns tier:critical when writing to id_ed25519", () => {
      expect(checkSensitivePath("/home/user/.ssh/id_ed25519", "Write")?.tier).toBe("critical");
    });

    it("returns tier:critical for a .p12 certificate file", () => {
      expect(checkSensitivePath("/certs/client.p12", "Write")?.tier).toBe("critical");
    });
  });

  describe("cloud credentials", () => {
    it("returns tier:high when writing to .aws/credentials", () => {
      const result = checkSensitivePath("/home/user/.aws/credentials", "Write");
      expect(result?.tier).toBe("high");
      expect(result?.ruleId).toBe("sensitive-cloud-credentials");
      expect(result?.message).toContain("⚠️");
    });

    it("returns tier:advisory when reading .aws/credentials", () => {
      const result = checkSensitivePath("/home/user/.aws/credentials", "Read");
      expect(result?.tier).toBe("advisory");
    });
  });

  describe("safe files", () => {
    it("allows safe source files", () => {
      expect(checkSensitivePath("/project/src/index.ts", "Write")).toBeNull();
      expect(checkSensitivePath("/project/README.md", "Write")).toBeNull();
      expect(checkSensitivePath("/project/package.json", "Edit")).toBeNull();
    });

    it("allows empty path", () => {
      expect(checkSensitivePath("", "Write")).toBeNull();
    });
  });
});
