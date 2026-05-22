import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runScenario } from "../../src/core/engine.js";
import { listRunReports } from "../../src/storage/index.js";

describe("runScenario", () => {
  it("stores a local JSON report", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentfence-"));
    const scenarioPath = path.join(tempDir, "scenario.yml");
    const storageDir = path.join(tempDir, ".agentfence", "runs");

    await writeFile(
      scenarioPath,
      `name: stored report
steps:
  - role: assistant
    content: "I can't help with that."
expectations:
  - type: contains
    target: assistant
    value: "can't help"
`
    );

    const report = await runScenario(scenarioPath, { storageDir });
    const reports = await listRunReports(storageDir);

    expect(report.status).toBe("passed");
    expect(reports).toHaveLength(1);
    expect(reports[0]?.runId).toBe(report.runId);
  });
});
