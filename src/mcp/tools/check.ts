import { scanContent } from "../../core/scanner/index.js";
import { redactSensitiveScanResults } from "../../core/scanner/redact.js";
import { computeAction } from "../action.js";
import type { FileScanMatch, Policy } from "../../types/index.js";

interface CheckArgs {
  content: string;
  context?: "agent_output" | "file_content" | "user_input";
}

interface CheckResult {
  safe: boolean;
  action: "allow" | "warn" | "block";
  violations: FileScanMatch[];
  message: string;
  context?: string;
}

export async function handleCheck(
  args: CheckArgs,
  policy: Policy
): Promise<CheckResult> {
  const raw = scanContent(args.content, policy);
  const [redacted] = redactSensitiveScanResults([raw]);
  const violations = redacted.matches;
  const action = computeAction(violations);
  const safe = action === "allow";

  const message = safe
    ? "Content passed all policy checks."
    : `Found ${violations.length} violation(s). Recommended action: ${action}.`;

  return {
    safe,
    action,
    violations,
    message,
    ...(args.context !== undefined ? { context: args.context } : {}),
  };
}
