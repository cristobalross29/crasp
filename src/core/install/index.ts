import { chmod, copyFile, mkdir, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BundleInstallAction, BundleInstallResult } from "../../types/index.js";

export function craspBundlePath(home = os.homedir()): string {
  return path.join(home, ".crasp", "bin", "crasp.js");
}

export function shq(s: string): string {
  return `'${s.replaceAll("'", "'\\''")}'`;
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export async function installBundle(opts: {
  sourcePath: string;
  destPath: string;
  sourceVersion: string;
  force?: boolean;
  readInstalledVersion: (p: string) => Promise<string | null>;
}): Promise<BundleInstallResult> {
  const { sourcePath, destPath, sourceVersion, force, readInstalledVersion } = opts;

  if (path.resolve(sourcePath) === path.resolve(destPath)) {
    return { action: "unchanged", previousVersion: null };
  }

  const previousVersion = force
    ? await readInstalledVersion(destPath).catch(() => null)
    : await readInstalledVersion(destPath);

  let action: BundleInstallAction;
  if (force) {
    action = "forced";
  } else if (previousVersion === null) {
    action = "installed";
  } else {
    const cmp = compareVersions(previousVersion, sourceVersion);
    if (cmp === 0) return { action: "unchanged", previousVersion };
    if (cmp > 0) return { action: "kept-newer", previousVersion };
    action = "updated";
  }

  // The dest is executed concurrently by live hooks in every project on this
  // machine — copy must be atomic (temp file + rename), never truncate-in-place.
  await mkdir(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await copyFile(sourcePath, tmpPath);
    await chmod(tmpPath, 0o755);
    await rename(tmpPath, destPath);
  } catch (error) {
    await rm(tmpPath, { force: true });
    throw error;
  }

  return { action, previousVersion };
}
