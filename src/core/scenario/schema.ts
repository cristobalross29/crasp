import { z } from "zod";

export const stepRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export const targetRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool",
  "any"
]);
export const severitySchema = z.enum(["low", "medium", "high", "critical"]);

export const scenarioStepSchema = z.object({
  id: z.string().min(1).optional(),
  role: stepRoleSchema,
  content: z.string().min(1)
});

export const scenarioExpectationSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(["contains", "not_contains", "regex"]),
  value: z.string().min(1),
  target: targetRoleSchema.default("assistant"),
  severity: severitySchema.default("medium"),
  description: z.string().optional()
});

export const scenarioSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(scenarioStepSchema).min(1),
  expectations: z.array(scenarioExpectationSchema).default([])
});

export type ParsedScenario = z.infer<typeof scenarioSchema>;
