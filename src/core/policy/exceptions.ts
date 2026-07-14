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

function matchesExceptionPath(
  filePath: string,
  exceptionPath: string,
  baseDir: string
): boolean {
  const toSlashes = (p: string): string => p.split(path.sep).join("/");
  const basename = path.basename(filePath);
  const relPath = toSlashes(path.normalize(path.relative(baseDir, filePath)));
  return (
    micromatch.isMatch(basename, exceptionPath) ||
    micromatch.isMatch(relPath, exceptionPath) ||
    micromatch.isMatch(toSlashes(filePath), exceptionPath)
  );
}

export function matchesException(
  filePath: string,
  op: HookTool,
  exceptions: PolicyException[],
  baseDir: string = process.cwd()
): boolean {
  const normalizedOp = OP_MAP[op];
  return exceptions.some((ex) => {
    if (!ex.path) return false;
    if (!matchesExceptionPath(filePath, ex.path, baseDir)) return false;
    return ex.ops.includes("any") || ex.ops.includes(normalizedOp);
  });
}

export function matchesScanException(
  filePath: string,
  exceptions: PolicyException[],
  baseDir: string = process.cwd()
): boolean {
  return exceptions.some((ex) => {
    if (!ex.path) return false;
    if (!(ex.ops.includes("scan") || ex.ops.includes("any"))) return false;
    return matchesExceptionPath(filePath, ex.path, baseDir);
  });
}
