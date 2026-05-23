import { z } from "zod";
import { severitySchema, targetRoleSchema } from "../scenario/schema.js";

export const policyRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  severity: severitySchema.default("medium"),
  pattern: z.string().min(1),
  target: targetRoleSchema.default("assistant"),
  message: z.string().optional()
});

export const policyExceptionSchema = z.object({
  id: z.string().optional(),
  path: z.string().min(1),
  ops: z.array(z.enum(["read", "write", "edit", "any"])).default(["any"]),
  reason: z.string().optional(),
});

export const policySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().optional(),
  rules: z.array(policyRuleSchema).default([]),
  exceptions: z.array(policyExceptionSchema).default([]),
});

export type ParsedPolicy = z.infer<typeof policySchema>;
