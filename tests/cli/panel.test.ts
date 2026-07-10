import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import os from "node:os";
import path from "node:path";
import type { PanelBootstrap } from "../../src/types/index.js";

const CLI = path.resolve("dist/index.js");

function entryLine(o: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    tool: "Write",
    filePath: "src/index.ts",
    outcome: "clean",
    ...o,
  });
}

async function waitForUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("panel did not start: " + out)), 15_000);
    child.stdout!.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const m = out.match(/listening at (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("panel exited " + code + ": " + out)); });
  });
}

describe("crasp panel", () => {
  let root: string;
  let home: string;
  let project: string;
  let child: ChildProcess;
  let url: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "crasp-panel-"));
    home = path.join(root, "home");
    project = path.join(root, "alpha");
    await mkdir(path.join(home, ".crasp"), { recursive: true });
    await mkdir(path.join(project, ".crasp"), { recursive: true });
    await writeFile(
      path.join(home, ".crasp", "projects.json"),
      JSON.stringify([
        { path: project, registeredAt: new Date().toISOString() },
        { path: path.join(root, "gone"), registeredAt: new Date().toISOString() },
      ])
    );
    await writeFile(
      path.join(project, ".crasp", "events.ndjson"),
      [
        entryLine({}),
        entryLine({ tool: "Bash", filePath: "sudo rm x", outcome: "ask", ruleId: "bash-sudo" }),
        entryLine({ outcome: "denied", ruleId: "token-leakage" }),
      ].join("\n") + "\n"
    );
    child = spawn(process.execPath, [CLI, "panel", "--no-open", "--port", "0"], {
      env: { ...process.env, HOME: home },
    });
    url = await waitForUrl(child);
  }, 30_000);

  afterAll(async () => {
    child?.kill();
    await rm(root, { recursive: true, force: true });
  });

  it("serves the dashboard page at /", async () => {
    const res = await fetch(url + "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("crasp panel");
    expect(html).toContain("Live feed");
  });

  it("bootstrap returns registered projects (skipping missing paths), events, aggregates", async () => {
    const res = await fetch(url + "/api/bootstrap");
    expect(res.status).toBe(200);
    const b = (await res.json()) as PanelBootstrap;
    expect(b.projects).toHaveLength(1);
    expect(b.projects[0].name).toBe("alpha");
    expect(typeof b.projects[0].healthy).toBe("boolean");
    expect(b.projects[0].lastEventTs).not.toBeNull();
    expect(b.events).toHaveLength(3);
    expect(b.events[0].project).toBe("alpha");
    expect(b.aggregates.today).toEqual({ clean: 1, advisory: 0, ask: 1, denied: 1 });
    expect(b.aggregates.topRules.map((r) => r.ruleId).sort()).toEqual(["bash-sudo", "token-leakage"]);
  });

  it("streams a newly appended event over SSE", async () => {
    const ac = new AbortController();
    const res = await fetch(url + "/api/stream", {
      signal: ac.signal,
      headers: { accept: "text/event-stream" },
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await appendFile(
      path.join(project, ".crasp", "events.ndjson"),
      entryLine({ outcome: "ask", ruleId: "secret-openai", filePath: "curl [REDACTED]" }) + "\n"
    );

    let received = "";
    const deadline = Date.now() + 10_000;
    while (!received.includes("secret-openai") && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    ac.abort();
    expect(received).toContain("secret-openai");
    const dataLine = received.split("\n").find((l) => l.startsWith("data: ") && l.includes("secret-openai"))!;
    const event = JSON.parse(dataLine.slice("data: ".length)) as { project: string; outcome: string };
    expect(event.project).toBe("alpha");
    expect(event.outcome).toBe("ask");
  }, 20_000);

  it("404s unknown routes", async () => {
    const res = await fetch(url + "/nope");
    expect(res.status).toBe(404);
  });

  it("bootstrap honors days=90 and falls back to 30 for anything else", async () => {
    const b90 = (await (await fetch(url + "/api/bootstrap?days=90")).json()) as PanelBootstrap;
    expect(b90.aggregates.daily).toHaveLength(90);
    const bOther = (await (await fetch(url + "/api/bootstrap?days=7")).json()) as PanelBootstrap;
    expect(bOther.aggregates.daily).toHaveLength(30);
  });

  it("rejects a spoofed Host header (DNS-rebinding defense)", async () => {
    // node's global fetch (undici) treats "host" as a forbidden header and
    // silently drops it, so use node:http directly to guarantee the spoofed
    // Host actually goes out on the wire.
    const { hostname, port } = new URL(url);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname,
          port,
          path: "/api/bootstrap",
          headers: { host: "evil.example.com" },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});
