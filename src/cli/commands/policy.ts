import path from "node:path";
import Table from "cli-table3";
import { loadConfig } from "../../core/config/index.js";
import { loadPolicy, policyExists } from "../../core/policy/loader.js";
import { mergeWithBuiltin } from "../../core/patterns/index.js";
import { scanContent } from "../../core/scanner/index.js";
import type { Policy } from "../../types/index.js";

export async function policyCommand(
  action: string,
  textParts: string[] = []
): Promise<void> {
  const policy = await loadMergedPolicy();

  if (action === "list") {
    listPolicy(policy);
    return;
  }

  if (action === "check") {
    checkText(policy, textParts.join(" "));
    return;
  }

  throw new Error(`Unsupported policy action: ${action}`);
}

async function loadMergedPolicy(): Promise<Policy> {
  const config = await loadConfig();
  const resolvedPolicyPath = config?.policyPath
    ? path.resolve(config.policyPath)
    : path.resolve("agentfence.policy.yml");
  const userPolicy = (await policyExists(resolvedPolicyPath))
    ? await loadPolicy(resolvedPolicyPath)
    : undefined;

  return mergeWithBuiltin(userPolicy);
}

function listPolicy(policy: Policy): void {
  const table = new Table({
    head: ["Rule", "Severity", "Target", "Description"]
  });

  for (const rule of policy.rules) {
    table.push([
      rule.id,
      rule.severity,
      rule.target ?? "assistant",
      rule.description
    ]);
  }

  console.log(table.toString());
}

function checkText(policy: Policy, text: string): void {
  const result = scanContent(text, policy);

  if (result.matches.length === 0) {
    console.log("No policy matches.");
    process.exitCode = 0;
    return;
  }

  const table = new Table({
    head: ["Rule", "Severity", "Match"]
  });

  for (const match of result.matches) {
    table.push([match.ruleId, match.severity, match.match]);
  }

  console.log(table.toString());
  process.exitCode = 1;
}
