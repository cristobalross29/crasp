import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { scenarioSchema } from "./schema.js";
import type { Scenario } from "../../types/index.js";

export async function loadScenario(filePath: string): Promise<Scenario> {
  const raw = await readFile(filePath, "utf8");
  const parsed = yaml.load(raw);

  return scenarioSchema.parse(parsed);
}
