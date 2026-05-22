import path from "node:path";
import { nanoid } from "nanoid";
import { evaluateScenario } from "./evaluator/index.js";
import { loadPolicy, policyExists } from "./policy/loader.js";
import { buildRunReport } from "./report/builder.js";
import { loadScenario } from "./scenario/loader.js";
import { saveRunReport } from "../storage/index.js";
import type { Policy, RunReport } from "../types/index.js";

export interface RunScenarioOptions {
  policyPath?: string;
  storageDir?: string;
}

export async function runScenario(
  scenarioPath: string,
  options: RunScenarioOptions = {}
): Promise<RunReport> {
  const startedAt = new Date();
  const resolvedScenarioPath = path.resolve(scenarioPath);
  const scenario = await loadScenario(resolvedScenarioPath);
  const resolvedPolicyPath = await resolvePolicyPath(options.policyPath);
  const policy = resolvedPolicyPath ? await loadPolicy(resolvedPolicyPath) : undefined;
  const evaluation = evaluateScenario(scenario, policy as Policy | undefined);
  const completedAt = new Date();
  const report = buildRunReport({
    runId: nanoid(12),
    scenario,
    scenarioPath: resolvedScenarioPath,
    policyPath: resolvedPolicyPath,
    startedAt,
    completedAt,
    evaluation
  });

  await saveRunReport(report, options.storageDir);

  return report;
}

async function resolvePolicyPath(policyPath?: string): Promise<string | undefined> {
  if (policyPath) {
    return path.resolve(policyPath);
  }

  const defaultPolicyPath = path.resolve("agentfence.policy.yml");

  return (await policyExists(defaultPolicyPath)) ? defaultPolicyPath : undefined;
}
