import { access } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { readHookLog } from "../hook-log/index.js";
import { loadPolicy, policyExists } from "../policy/loader.js";
import { mergeWithBuiltin } from "../patterns/index.js";
import { defaultCraspDir, readRegistry } from "../registry/index.js";
import { aggregateEvents } from "./aggregate.js";
import { PANEL_PAGE } from "./page.js";
import { tailLog, type LogTailer } from "./tail.js";
import type { PanelBootstrap, PanelProjectInfo, PanelRuleInfo, TaggedEvent } from "../../types/index.js";

const EVENTS_CAP = 5000;
const HEARTBEAT_MS = 15_000;

// Registry entries whose folder is genuinely gone (vs. a transient/permission
// error) are shown as "missing"; anything else is treated as a live project so
// a flaky stat doesn't misreport a healthy project as deleted.
function isNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

// Timestamps are compared as epoch ms, never lexically: a hook-log ts is only
// typed as string and could carry an offset that sorts differently from its
// actual instant.
function parseSince(raw: string | null): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

// DNS-rebinding defense: only accept requests whose Host header names this
// loopback server, regardless of what address it's actually bound on.
const ALLOWED_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

function isAllowedHost(host: string | undefined): boolean {
  return typeof host === "string" && ALLOWED_HOST_RE.test(host);
}

export interface PanelServerOptions {
  port: number;
  craspDir?: string;
  getProjectHealth: (dir: string) => Promise<{ ok: boolean; problems: string[] }>;
}

export interface PanelServer {
  port: number;
  close(): Promise<void>;
}

interface RegistryDirs {
  live: string[];
  missing: string[];
}

async function partitionRegistry(craspDir?: string): Promise<RegistryDirs> {
  const entries = await readRegistry(craspDir ?? defaultCraspDir());
  const live: string[] = [];
  const missing: string[] = [];
  for (const entry of entries) {
    try {
      await access(entry.path);
      live.push(entry.path);
    } catch (err) {
      if (isNotFound(err)) missing.push(entry.path);
      else live.push(entry.path); // transient/permission — assume it still exists
    }
  }
  return { live, missing };
}

// Rule metadata for the panel's plain-language names: the built-ins plus each
// live project's user-defined rules (merged, deduped by id — built-in wins).
async function collectRules(liveDirs: string[]): Promise<PanelRuleInfo[]> {
  const byId = new Map<string, PanelRuleInfo>();
  const merged = await Promise.all(
    liveDirs.map(async (dir) => {
      const policyPath = path.join(dir, "crasp.policy.yml");
      if (!(await policyExists(policyPath))) return mergeWithBuiltin(undefined);
      try {
        return mergeWithBuiltin(await loadPolicy(policyPath));
      } catch {
        return mergeWithBuiltin(undefined); // unreadable/invalid policy — built-ins only
      }
    })
  );
  // Seed built-ins first so a user rule can never shadow a built-in id.
  for (const policy of [mergeWithBuiltin(undefined), ...merged]) {
    for (const rule of policy.rules) {
      if (!byId.has(rule.id)) {
        byId.set(rule.id, { id: rule.id, description: rule.description, severity: rule.severity });
      }
    }
  }
  return Array.from(byId.values());
}

async function buildBootstrap(
  dirs: RegistryDirs,
  getProjectHealth: PanelServerOptions["getProjectHealth"],
  days: number,
  sinceMs: number | null
): Promise<PanelBootstrap> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - days);

  const all: TaggedEvent[] = [];
  const [projects, rules] = await Promise.all([
    Promise.all(
      dirs.live.map(async (dir): Promise<PanelProjectInfo> => {
        const name = path.basename(dir);
        const [entries, health] = await Promise.all([
          readHookLog(dir, { since: windowStart }),
          getProjectHealth(dir),
        ]);
        // lastEventTs reflects the whole window, BEFORE the since-filter, so a
        // project's "last seen" stays truthful when the user starts fresh.
        const lastEventTs = entries.length > 0 ? entries[entries.length - 1].ts : null;
        for (const entry of entries) {
          if (sinceMs === null || Date.parse(entry.ts) >= sinceMs) {
            all.push({ ...entry, project: name });
          }
        }
        return { path: dir, name, healthy: health.ok, problems: health.problems, lastEventTs, missing: false };
      })
    ),
    collectRules(dirs.live),
  ]);

  for (const gonePath of dirs.missing) {
    projects.push({
      path: gonePath,
      name: path.basename(gonePath),
      healthy: false,
      problems: [],
      lastEventTs: null,
      missing: true,
    });
  }

  all.sort((a, b) => b.ts.localeCompare(a.ts)); // newest first (canonical ISO in the log)
  return {
    projects,
    events: all.slice(0, EVENTS_CAP),
    aggregates: aggregateEvents(all, new Date(), days),
    rules,
  };
}

export async function startPanelServer(opts: PanelServerOptions): Promise<PanelServer> {
  const dirs = await partitionRegistry(opts.craspDir);
  const clients = new Set<ServerResponse>();

  const tailers: LogTailer[] = dirs.live.map((dir) =>
    tailLog(path.join(dir, ".crasp", "events.ndjson"), (line) => {
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        return; // corrupt line — same tolerance as readHookLog
      }
      const tagged = { ...(entry as object), project: path.basename(dir) };
      const frame = `data: ${JSON.stringify(tagged)}\n\n`;
      for (const client of clients) client.write(frame);
    })
  );

  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": ping\n\n");
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const server = createServer((req, res) => {
    try {
      if (!isAllowedHost(req.headers.host)) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "forbidden host" }));
        return;
      }

      const url = (req.url ?? "/").split("?")[0];

      if (url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PANEL_PAGE);
        return;
      }

      if (url === "/api/bootstrap") {
        const params = new URL(req.url ?? "/", "http://localhost").searchParams;
        const days = params.get("days") === "90" ? 90 : 30; // anything else falls back to 30
        const sinceMs = parseSince(params.get("since"));
        void buildBootstrap(dirs, opts.getProjectHealth, days, sinceMs)
          .then((bootstrap) => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(bootstrap));
          })
          .catch(() => {
            if (!res.headersSent) {
              res.writeHead(500, { "content-type": "application/json" });
              res.end(JSON.stringify({ error: "bootstrap failed" }));
            } else {
              res.destroy();
            }
          });
        return;
      }

      if (url === "/api/stream") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        res.on("error", () => clients.delete(res));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bootstrap failed" }));
      } else {
        res.destroy();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : opts.port;

  return {
    port,
    close(): Promise<void> {
      for (const tailer of tailers) tailer.stop();
      clearInterval(heartbeat);
      for (const client of clients) client.end();
      clients.clear();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
