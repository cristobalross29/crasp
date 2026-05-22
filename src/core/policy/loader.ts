import { access, readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { policySchema } from "./schema.js";
import type { Policy } from "../../types/index.js";

export async function loadPolicy(filePath: string): Promise<Policy> {
  const raw = await readFile(filePath, "utf8");
  const parsed = yaml.load(raw);

  return policySchema.parse(parsed);
}

export async function policyExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
