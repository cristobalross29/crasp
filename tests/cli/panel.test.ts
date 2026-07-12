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
  let oldTs: string;
  let newestTs: string;

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
    // A user policy with a custom rule id so we can assert merged-rule metadata.
    await writeFile(
      path.join(project, "crasp.policy.yml"),
      [
        "id: test",
        "name: Test",
        "rules:",
        "  - id: my-custom-rule",
        "    description: My custom thing",
        "    severity: high",
        "    pattern: forbidden-token",
        "  - id: prompt-injection", // collides with a built-in id — built-in must win
        "    description: SHOULD NOT WIN",
        "    severity: low",
        "    pattern: whatever",
      ].join("\n") + "\n"
    );
    // Explicit timestamps: one event 5 days back (in the 30d window but before a
    // 2-day cutoff), three today. newestTs is the most recent so lastEventTs is
    // deterministic and distinguishable from a since-filtered computation.
    const t0 = Date.now();
    oldTs = new Date(t0 - 5 * 86_400_000).toISOString();
    newestTs = new Date(t0 - 1_000).toISOString();
    await writeFile(
      path.join(project, ".crasp", "events.ndjson"),
      [
        entryLine({ ts: oldTs, tool: "Edit", filePath: "old.ts", outcome: "clean" }),
        entryLine({ ts: new Date(t0 - 3_000).toISOString(), outcome: "clean" }),
        entryLine({ ts: new Date(t0 - 2_000).toISOString(), tool: "Bash", filePath: "sudo rm x", outcome: "ask", ruleId: "bash-sudo" }),
        entryLine({ ts: newestTs, outcome: "denied", ruleId: "token-leakage" }),
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

  it("serves the dashboard page at / with the v2 tab markers", async () => {
    const res = await fetch(url + "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("crasp panel");
    for (const marker of [
      'data-tab="overview"', 'data-tab="activity"', 'data-tab="rules"', 'data-tab="projects"',
      'id="verdict"', 'id="feed"', 'id="start-fresh"',
    ]) {
      expect(html, marker).toContain(marker);
    }
  });

  it("the page has no XSS sinks and exactly one String.raw template", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(path.resolve("src/core/panel/page.ts"), "utf8");
    for (const sink of ["innerHTML", "insertAdjacentHTML", "outerHTML", "document.write"]) {
      expect(src, sink).not.toContain(sink);
    }
    expect((src.match(/String\.raw/g) ?? []).length).toBe(1);
    const body = src.slice(src.indexOf("String.raw"));
    expect(body.includes("$" + "{")).toBe(false);
  });

  it("bootstrap includes live + missing projects, events, aggregates", async () => {
    const res = await fetch(url + "/api/bootstrap");
    expect(res.status).toBe(200);
    const b = (await res.json()) as PanelBootstrap;
    expect(b.projects).toHaveLength(2);
    const alpha = b.projects.find((p) => p.name === "alpha")!;
    expect(alpha.missing).toBe(false);
    expect(typeof alpha.healthy).toBe("boolean");
    expect(alpha.lastEventTs).toBe(newestTs);
    const gone = b.projects.find((p) => p.name === "gone")!;
    expect(gone.missing).toBe(true);
    expect(gone.healthy).toBe(false);
    expect(b.events).toHaveLength(4);
    expect(b.events[0].project).toBe("alpha");
    expect(b.events[0].projectPath).toBe(project); // stable identity for dedup/collision-safety
    expect(b.aggregates.today).toEqual({ clean: 1, advisory: 0, ask: 1, denied: 1 });
    expect(b.aggregates.topRules.map((r) => r.ruleId).sort()).toEqual(["bash-sudo", "token-leakage"]);
  });

  it("since filters events and aggregates numerically, but not lastEventTs", async () => {
    const cutoff = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const b = (await (await fetch(url + "/api/bootstrap?since=" + encodeURIComponent(cutoff))).json()) as PanelBootstrap;
    expect(b.events).toHaveLength(3); // the 5-day-old event is excluded
    expect(b.events.every((e) => Date.parse(e.ts) >= Date.parse(cutoff))).toBe(true);
    const total = b.aggregates.daily.reduce((n, d) => n + d.clean + d.advisory + d.ask + d.denied, 0);
    expect(total).toBe(3);
    // lastEventTs is computed over the window BEFORE the since-filter.
    const alpha = b.projects.find((p) => p.name === "alpha")!;
    expect(alpha.lastEventTs).toBe(newestTs);
  });

  it("a future since empties events but keeps lastEventTs (proves pre-filter computation)", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const b = (await (await fetch(url + "/api/bootstrap?since=" + encodeURIComponent(future))).json()) as PanelBootstrap;
    expect(b.events).toHaveLength(0);
    const alpha = b.projects.find((p) => p.name === "alpha")!;
    expect(alpha.lastEventTs).toBe(newestTs); // would be null if computed after the filter
  });

  it("ignores an unparseable since", async () => {
    const b = (await (await fetch(url + "/api/bootstrap?since=banana")).json()) as PanelBootstrap;
    expect(b.events).toHaveLength(4);
  });

  it("exposes built-in AND user-defined rule metadata", async () => {
    const b = (await (await fetch(url + "/api/bootstrap")).json()) as PanelBootstrap;
    const pi = b.rules.find((r) => r.id === "prompt-injection");
    expect(pi).toBeDefined();
    expect(pi!.severity).toBe("high");
    expect(pi!.description.length).toBeGreaterThan(0);
    // the project's colliding user rule must NOT override the built-in
    expect(pi!.description).not.toBe("SHOULD NOT WIN");
    expect(b.rules.filter((r) => r.id === "prompt-injection")).toHaveLength(1);
    const custom = b.rules.find((r) => r.id === "my-custom-rule");
    expect(custom).toBeDefined();
    expect(custom!.description).toBe("My custom thing");
    expect(custom!.severity).toBe("high");
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
