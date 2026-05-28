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
  const relPath = path.normalize(path.relative(process.cwd(), filePath));
  const normalizedOp = OP_MAP[op];
  return exceptions.some((ex) => {
    // Match against basename (simple patterns like ".env.local") OR relative path
    // (directory-scoped patterns like "secrets/*.key") OR the full path
    const pathMatches =
      micromatch.isMatch(basename, ex.path) ||
      micromatch.isMatch(relPath, ex.path) ||
      micromatch.isMatch(filePath, ex.path);
    if (!pathMatches) return false;
    return ex.ops.includes("any") || ex.ops.includes(normalizedOp);
  });
}
