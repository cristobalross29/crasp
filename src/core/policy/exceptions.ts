import micromatch from "micromatch";
import path from "node:path";
import type { PolicyException, ExceptionOp } from "../../types/index.js";
import type { HookTool } from "../scanner/sensitive-paths.js";

const OP_MAP: Record<HookTool, ExceptionOp> = {
  Write: "write",
  Edit: "edit",
  Read: "read",
};

export function matchesException(
  filePath: string,
  op: HookTool,
  exceptions: PolicyException[]
): boolean {
  const basename = path.basename(filePath);
  const normalizedOp = OP_MAP[op];
  return exceptions.some((ex) => {
    const pathMatches = micromatch.isMatch(basename, ex.path);
    if (!pathMatches) return false;
    return ex.ops.includes("any") || ex.ops.includes(normalizedOp);
  });
}
