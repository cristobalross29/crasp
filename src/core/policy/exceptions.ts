import micromatch from "micromatch";
import path from "node:path";
import type { PolicyException, ExceptionOp } from "../../types/index.js";
import type { HookTool } from "../scanner/sensitive-paths.js";

const OP_MAP: Record<HookTool, ExceptionOp> = {
  Write: "write",
  Edit: "edit",
  Read: "read",
  Bash: "bash",
};

export function matchesBashException(
  command: string,
  exceptions: PolicyException[]
): boolean {
  return exceptions.some((ex) => {
    if (!ex.command) return false;
    if (!(ex.ops.includes("bash") || ex.ops.includes("any"))) return false;
    try {
      return new RegExp(ex.command).test(command);
    } catch {
      // Invalid regex in user policy — fail closed on the match (no bypass)
      return false;
    }
  });
}

export function matchesException(
  filePath: string,
  op: HookTool,
  exceptions: PolicyException[]
): boolean {
  const basename = path.basename(filePath);
  const relPath = path.normalize(path.relative(process.cwd(), filePath));
  const normalizedOp = OP_MAP[op];
  return exceptions.some((ex) => {
    if (!ex.path) return false;
    const pathMatches =
      micromatch.isMatch(basename, ex.path) ||
      micromatch.isMatch(relPath, ex.path) ||
      micromatch.isMatch(filePath, ex.path);
    if (!pathMatches) return false;
    return ex.ops.includes("any") || ex.ops.includes(normalizedOp);
  });
}
