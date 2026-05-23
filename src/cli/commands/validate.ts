import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { ZodError } from "zod";
import { policySchema } from "../../core/policy/schema.js";
import { scenarioSchema } from "../../core/scenario/schema.js";

export async function validateCommand(
  kind: string,
  filePath: string
): Promise<void> {
  const raw = await readFile(filePath, "utf8");
  const parsed = yaml.load(raw);
  const schema = kind === "scenario" ? scenarioSchema : kind === "policy" ? policySchema : undefined;

  if (!schema) {
    throw new Error(`Unsupported validation type: ${kind}`);
  }

  try {
    schema.parse(parsed);
    console.log("Valid");
    process.exitCode = 0;
  } catch (error) {
    if (error instanceof ZodError) {
      console.log(JSON.stringify({ valid: false, issues: error.issues }, null, 2));
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}
