import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readRegistry, registerProject, registryPath } from "../../src/core/registry/index.js";
import type { RegistryEntry } from "../../src/types/index.js";

async function tmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "crasp-registry-"));
}

describe("project registry", () => {
  it("readRegistry returns [] when the file does not exist", async () => {
    const dir = await tmpDir();
    try {
      expect(await readRegistry(dir)).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("readRegistry returns [] for corrupt JSON and non-array JSON", async () => {
    const dir = await tmpDir();
    try {
      await writeFile(registryPath(dir), "{not json");
      expect(await readRegistry(dir)).toEqual([]);
      await writeFile(registryPath(dir), JSON.stringify({ nope: true }));
      expect(await readRegistry(dir)).toEqual([]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("readRegistry drops malformed entries but keeps valid ones", async () => {
    const dir = await tmpDir();
    try {
      const good: RegistryEntry = { path: "/a/b", registeredAt: "2026-07-09T00:00:00.000Z" };
      await writeFile(registryPath(dir), JSON.stringify([good, { path: 42 }, "junk", null]));
      expect(await readRegistry(dir)).toEqual([good]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("registerProject creates the file, resolves to absolute path, and dedupes", async () => {
    const dir = await tmpDir();
    try {
      await registerProject("/my/project", dir);
      await registerProject("/my/project", dir);
      await registerProject("/my/project/../project", dir);
      const entries = await readRegistry(dir);
      expect(entries).toHaveLength(1);
      expect(entries[0].path).toBe(path.resolve("/my/project"));
      expect(new Date(entries[0].registeredAt).getTime()).not.toBeNaN();
      const raw = await readFile(registryPath(dir), "utf8");
      expect(raw.endsWith("\n")).toBe(true);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("registerProject appends a second project and preserves the first", async () => {
    const dir = await tmpDir();
    try {
      await registerProject("/one", dir);
      await registerProject("/two", dir);
      expect((await readRegistry(dir)).map((e) => e.path)).toEqual([
        path.resolve("/one"),
        path.resolve("/two"),
      ]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("registerProject never throws, even when the dir is unwritable", async () => {
    const dir = await tmpDir();
    try {
      await mkdir(path.join(dir, "ro"));
      await chmod(path.join(dir, "ro"), 0o444);
      await expect(registerProject("/x", path.join(dir, "ro", "nested"))).resolves.toBeUndefined();
    } finally {
      await chmod(path.join(dir, "ro"), 0o755).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  });
});
