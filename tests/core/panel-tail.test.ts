import { describe, expect, it } from "vitest";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { tailLog } from "../../src/core/panel/tail.js";

const POLL = 25;

async function withTmp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "crasp-tail-"));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe("tailLog", () => {
  it("does not replay existing lines, then emits appended complete lines", async () => {
    await withTmp(async (dir) => {
      const log = path.join(dir, "events.ndjson");
      await writeFile(log, '{"old":1}\n');
      const lines: string[] = [];
      const tailer = tailLog(log, (l) => lines.push(l), POLL);
      try {
        // let the tailer initialize its offset at EOF
        await expect.poll(() => lines.length, { timeout: 2000 }).toBe(0);
        await appendFile(log, '{"a":1}\n{"a":2}\n');
        await expect.poll(() => lines, { timeout: 2000 }).toEqual(['{"a":1}', '{"a":2}']);
      } finally { tailer.stop(); }
    });
  });

  it("holds a partial line until its newline arrives", async () => {
    await withTmp(async (dir) => {
      const log = path.join(dir, "events.ndjson");
      await writeFile(log, "");
      const lines: string[] = [];
      const tailer = tailLog(log, (l) => lines.push(l), POLL);
      try {
        await new Promise((r) => setTimeout(r, POLL * 4));
        await appendFile(log, '{"half":');
        await new Promise((r) => setTimeout(r, POLL * 4));
        expect(lines).toEqual([]);
        await appendFile(log, "1}\n");
        await expect.poll(() => lines, { timeout: 2000 }).toEqual(['{"half":1}']);
      } finally { tailer.stop(); }
    });
  });

  it("recovers from truncation by re-reading from the top", async () => {
    await withTmp(async (dir) => {
      const log = path.join(dir, "events.ndjson");
      await writeFile(log, '{"old":1}\n{"old":2}\n');
      const lines: string[] = [];
      const tailer = tailLog(log, (l) => lines.push(l), POLL);
      try {
        await new Promise((r) => setTimeout(r, POLL * 4));
        await writeFile(log, '{"new":1}\n'); // smaller than before → truncation
        await expect.poll(() => lines, { timeout: 2000 }).toEqual(['{"new":1}']);
      } finally { tailer.stop(); }
    });
  });

  it("picks up a log file created after tailing starts", async () => {
    await withTmp(async (dir) => {
      const log = path.join(dir, "events.ndjson");
      const lines: string[] = [];
      const tailer = tailLog(log, (l) => lines.push(l), POLL);
      try {
        await new Promise((r) => setTimeout(r, POLL * 4));
        await writeFile(log, '{"first":1}\n');
        await expect.poll(() => lines, { timeout: 2000 }).toEqual(['{"first":1}']);
      } finally { tailer.stop(); }
    });
  });

  it("survives the log file being deleted mid-tail and recreated", async () => {
    await withTmp(async (dir) => {
      const log = path.join(dir, "events.ndjson");
      await writeFile(log, '{"old":1}\n');
      const lines: string[] = [];
      const tailer = tailLog(log, (l) => lines.push(l), POLL);
      try {
        await expect.poll(() => lines.length, { timeout: 2000 }).toBe(0);
        await appendFile(log, '{"before":1}\n');
        await expect.poll(() => lines, { timeout: 2000 }).toEqual(['{"before":1}']);

        await rm(log);
        // Give the tailer several poll ticks to notice the missing file and
        // prove it doesn't throw/crash while retrying.
        await new Promise((r) => setTimeout(r, POLL * 6));

        await writeFile(log, '{"after":1}\n');
        await expect.poll(() => lines, { timeout: 2000 }).toEqual(['{"before":1}', '{"after":1}']);
      } finally { tailer.stop(); }
    });
  });
});
