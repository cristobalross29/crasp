import { access } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { readHookLog } from "../hook-log/index.js";
import { defaultCraspDir, readRegistry } from "../registry/index.js";
import { aggregateEvents } from "./aggregate.js";
import { PANEL_PAGE } from "./page.js";
import { tailLog, type LogTailer } from "./tail.js";
import type { PanelBootstrap, PanelProjectInfo, TaggedEvent } from "../../types/index.js";

const EVENTS_CAP = 5000;
const HEARTBEAT_MS = 15_000;

export interface PanelServerOptions {
  port: number;
  craspDir?: string;
  getProjectHealth: (dir: string) => Promise<{ ok: boolean; problems: string[] }>;
}

export interface PanelServer {
  port: number;
  close(): Promise<void>;
}

async function existingProjects(craspDir?: string): Promise<string[]> {
  const entries = await readRegistry(craspDir ?? defaultCraspDir());
  const dirs: string[] = [];
  for (const entry of entries) {
    try {
      await access(entry.path);
      dirs.push(entry.path);
    } catch {
      // Stale registry entry — the project moved or was deleted. Skip it.
    }
  }
  return dirs;
}

async function buildBootstrap(
  dirs: string[],
  getProjectHealth: PanelServerOptions["getProjectHealth"],
  days: number
): Promise<PanelBootstrap> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const all: TaggedEvent[] = [];
  const projects: PanelProjectInfo[] = await Promise.all(
    dirs.map(async (dir) => {
      const name = path.basename(dir);
      const [entries, health] = await Promise.all([
        readHookLog(dir, { since }),
        getProjectHealth(dir),
      ]);
      for (const entry of entries) all.push({ ...entry, project: name });
      return {
        path: dir,
        name,
        healthy: health.ok,
        problems: health.problems,
        lastEventTs: entries.length > 0 ? entries[entries.length - 1].ts : null,
      };
    })
  );

  all.sort((a, b) => b.ts.localeCompare(a.ts)); // newest first
  return {
    projects,
    events: all.slice(0, EVENTS_CAP),
    aggregates: aggregateEvents(all, new Date(), days),
  };
}

export async function startPanelServer(opts: PanelServerOptions): Promise<PanelServer> {
  const dirs = await existingProjects(opts.craspDir);
  const clients = new Set<ServerResponse>();

  const tailers: LogTailer[] = dirs.map((dir) =>
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
      const url = (req.url ?? "/").split("?")[0];

      if (url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PANEL_PAGE);
        return;
      }

      if (url === "/api/bootstrap") {
        const daysParam = new URL(req.url ?? "/", "http://localhost").searchParams.get("days");
        const days = daysParam === "90" ? 90 : 30; // anything else falls back to 30
        void buildBootstrap(dirs, opts.getProjectHealth, days)
          .then((bootstrap) => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(bootstrap));
          })
          .catch((error: unknown) => {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
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
    } catch (error: unknown) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
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
