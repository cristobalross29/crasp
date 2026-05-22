import { z } from "zod";
import { scenarioStepSchema } from "../scenario/schema.js";

export const traceSchema = z.object({
  steps: z.array(scenarioStepSchema)
});

export type ParsedTrace = z.infer<typeof traceSchema>;
