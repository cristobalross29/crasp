import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CLI_VERSION } from "../../src/version.js";

const CLI = path.resolve("dist/index.js");

async function inBareDir<T>(fn: (copied: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "crasp-bundle-"));
  try {
    const copied = path.join(dir, "crasp.js");
    await copyFile(CLI, copied);
    return await fn(copied, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("standalone bundle", () => {
  it("runs alone in a bare temp dir (no node_modules)", () =>
    inBareDir(async (copied, dir) => {
      const version = spawnSync(process.execPath, [copied, "--version"], { encoding: "utf8" });
      expect(version.status).toBe(0);
      expect(version.stdout.trim()).toBe(CLI_VERSION);

      // Hook hot path standalone: a secret-bearing Write must deny.
      const fakeKey = "AKIA" + "ABCDEFGHIJKLMNOP";
      const payload = JSON.stringify({
        tool_input: { file_path: "app.ts", content: `const k = "${fakeKey}";` },
      });
      const check = spawnSync(process.execPath, [copied, "check", "--hook-input", "Write"], {
        input: payload,
        encoding: "utf8",
        cwd: dir,
      });
      expect(check.status).toBe(0);
      const out = JSON.parse(check.stdout.trim()) as {
        hookSpecificOutput?: { permissionDecision?: string };
      };
      expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
    }));

  it("starts the MCP server standalone (riskiest bundled dep)", () =>
    inBareDir(async (copied, dir) => {
      const child = spawn(process.execPath, [copied, "mcp"], { cwd: dir });
      try {
        const reply = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("MCP server produced no reply in 8s")), 8000);
          let buf = "";
          child.stdout.on("data", (d: Buffer) => {
            buf += d.toString();
            if (buf.includes("\n")) { clearTimeout(timer); resolve(buf); }
          });
          child.on("error", (e) => { clearTimeout(timer); reject(e); });
          child.stderr.on("data", () => {}); // drain
          child.stdin.write(JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "initialize",
            params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
          }) + "\n");
        });
        expect(reply).toContain('"jsonrpc"');
        expect(reply).toContain('"result"');
      } finally {
        child.kill();
      }
    }), 15000);

  it("keeps the shebang as line 1 (npx/bin usage)", async () => {
    const first = (await readFile(CLI, "utf8")).split("\n")[0];
    expect(first).toBe("#!/usr/bin/env node");
  });
});
