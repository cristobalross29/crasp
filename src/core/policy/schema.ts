import { z } from "zod";
import { severitySchema, targetRoleSchema } from "../scenario/schema.js";

export const policyRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  severity: severitySchema.default("medium"),
  pattern: z.string().min(1),
  target: targetRoleSchema.default("assistant"),
  message: z.string().optional(),
  caseSensitive: z.boolean().optional()
});

export const policyExceptionSchema = z
  .object({
    id: z.string().optional(),
    path: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
    ops: z
      .array(z.enum(["read", "write", "edit", "bash", "scan", "any"]))
      .min(1)
      .default(["any"]),
    reason: z.string().optional(),
  })
  .refine((v) => v.path !== undefined || v.command !== undefined, {
    message: "An exception must have at least one of 'path' or 'command'",
  })
  // Only the NEW scan op gets a stricter shape — tightening the pre-existing
  // ops would reject 0.2.3-valid policies, and a policy parse failure silently
  // degrades hooks to builtin-only.
  .refine((v) => !v.ops.includes("scan") || v.path !== undefined, {
    message: "'scan' ops require a 'path'",
  });

export const policySecretsSchema = z.object({
  allowlist: z.array(z.string()).optional(),
});

export const policySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().optional(),
  rules: z.array(policyRuleSchema).default([]),
  exceptions: z.array(policyExceptionSchema).default([]),
  secrets: policySecretsSchema.optional(),
});

export type ParsedPolicy = z.infer<typeof policySchema>;
