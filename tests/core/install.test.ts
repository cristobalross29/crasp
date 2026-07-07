import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  compareVersions,
  craspBundlePath,
  installBundle,
  shq,
} from "../../src/core/install/index.js";

describe("compareVersions", () => {
  it("orders numerically per segment", () => {
    expect(compareVersions("0.2.1", "0.2.1")).toBe(0);
    expect(compareVersions("0.2.0", "0.2.1")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });
});

describe("shq", () => {
  it("single-quotes and escapes embedded quotes", () => {
    expect(shq("/plain/path")).toBe("'/plain/path'");
    expect(shq("/pa th/$HOME`x'y")).toBe("'/pa th/$HOME`x'\\''y'");
  });
});

describe("craspBundlePath", () => {
  it("builds <home>/.crasp/bin/crasp.js", () => {
    expect(craspBundlePath("/home/u")).toBe(path.join("/home/u", ".crasp", "bin", "crasp.js"));
  });
});

describe("installBundle", () => {
  async function setup() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "crasp-install-"));
    const sourcePath = path.join(dir, "source.js");
    const destPath = path.join(dir, "home", ".crasp", "bin", "crasp.js");
    await writeFile(sourcePath, "SOURCE-CONTENT");
    return { dir, sourcePath, destPath };
  }

  it("installs fresh when dest missing, leaving no temp files behind", async () => {
    const { dir, sourcePath, destPath } = await setup();
    try {
      const result = await installBundle({
        sourcePath, destPath, sourceVersion: "0.2.1",
        readInstalledVersion: async () => null,
      });
      expect(result).toEqual({ action: "installed", previousVersion: null });
      expect(await readFile(destPath, "utf8")).toBe("SOURCE-CONTENT");
      const siblings = await readdir(path.dirname(destPath));
      expect(siblings).toEqual(["crasp.js"]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("updates when installed version is older", async () => {
    const { dir, sourcePath, destPath } = await setup();
    try {
      const result = await installBundle({
        sourcePath, destPath, sourceVersion: "0.2.1",
        readInstalledVersion: async () => "0.2.0",
      });
      expect(result).toEqual({ action: "updated", previousVersion: "0.2.0" });
      expect(await readFile(destPath, "utf8")).toBe("SOURCE-CONTENT");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("keeps a newer installed bundle untouched", async () => {
    const { dir, sourcePath, destPath } = await setup();
    try {
      const result = await installBundle({
        sourcePath, destPath, sourceVersion: "0.2.1",
        readInstalledVersion: async () => "0.3.0",
      });
      expect(result).toEqual({ action: "kept-newer", previousVersion: "0.3.0" });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("force overwrites even a newer installed bundle", async () => {
    const { dir, sourcePath, destPath } = await setup();
    try {
      const result = await installBundle({
        sourcePath, destPath, sourceVersion: "0.2.1", force: true,
        readInstalledVersion: async () => "0.3.0",
      });
      expect(result).toEqual({ action: "forced", previousVersion: "0.3.0" });
      expect(await readFile(destPath, "utf8")).toBe("SOURCE-CONTENT");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("skips copy when versions match", async () => {
    const { dir, sourcePath, destPath } = await setup();
    try {
      const result = await installBundle({
        sourcePath, destPath, sourceVersion: "0.2.1",
        readInstalledVersion: async () => "0.2.1",
      });
      expect(result).toEqual({ action: "unchanged", previousVersion: "0.2.1" });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("no-ops when source IS dest (setup re-run from installed copy)", async () => {
    const { dir, sourcePath } = await setup();
    try {
      const result = await installBundle({
        sourcePath, destPath: sourcePath, sourceVersion: "0.2.1",
        readInstalledVersion: async () => { throw new Error("must not be called"); },
      });
      expect(result).toEqual({ action: "unchanged", previousVersion: null });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
