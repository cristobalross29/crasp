import { watch, type FSWatcher } from "node:fs";
import { open, stat } from "node:fs/promises";
import path from "node:path";

export interface LogTailer {
  stop(): void;
}

export function tailLog(
  logPath: string,
  onLine: (line: string) => void,
  pollMs = 1000
): LogTailer {
  let offset = 0;
  let reading = false;
  let pending = false;
  let stopped = false;

  // Start at EOF if the file already exists — history is bootstrap's job.
  // A file that appears only later starts at 0 so its first events are emitted.
  const init = stat(logPath)
    .then((st) => { offset = st.size; })
    .catch(() => { offset = 0; });

  async function readNew(): Promise<void> {
    if (reading) { pending = true; return; }
    reading = true;
    try {
      await init;
      const st = await stat(logPath).catch(() => null);
      if (!st || stopped) return;
      if (st.size < offset) offset = 0; // truncated or rotated
      if (st.size === offset) return;
      const fh = await open(logPath, "r");
      try {
        const start = offset;
        const len = st.size - start;
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, start);
        const nl = buf.lastIndexOf(0x0a);
        if (nl === -1) return; // no complete line yet — wait for more bytes
        offset = start + nl + 1;
        for (const line of buf.subarray(0, nl).toString("utf8").split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !stopped) onLine(trimmed);
        }
      } finally {
        await fh.close();
      }
    } finally {
      reading = false;
      if (pending && !stopped) { pending = false; void readNew(); }
    }
  }

  void init.then(() => readNew());

  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(path.dirname(logPath), () => void readNew());
  } catch {
    // Directory may not exist yet — the poll timer covers it.
  }
  const timer = setInterval(() => void readNew(), pollMs);
  timer.unref?.();

  return {
    stop() {
      stopped = true;
      watcher?.close();
      clearInterval(timer);
    },
  };
}
