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

const GLOB_OPTS = { dot: true };

function matchesExceptionPath(
  filePath: string,
  exceptionPath: string,
  baseDir: string,
  // The basename tier makes a bare filename match at any depth. Hook exceptions
  // keep it (the documented ".env.local" style relies on it); scan exceptions
  // must NOT — in the commit gate, excepting "README.md" may not silently
  // except payload/README.md. Scan globs resolve relative to the project root.
  includeBasename: boolean
): boolean {
  const toSlashes = (p: string): string => p.split(path.sep).join("/");
  const relPath = toSlashes(path.normalize(path.relative(baseDir, filePath)));
  return (
    (includeBasename &&
      micromatch.isMatch(path.basename(filePath), exceptionPath, GLOB_OPTS)) ||
    micromatch.isMatch(relPath, exceptionPath, GLOB_OPTS) ||
    micromatch.isMatch(toSlashes(filePath), exceptionPath, GLOB_OPTS)
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
    if (!matchesExceptionPath(filePath, ex.path, baseDir, true)) return false;
    return ex.ops.includes("any") || ex.ops.includes(normalizedOp);
  });
}

// The "scan" op must be explicit: "any" predates it and means "all hook ops".
// Treating existing ops:[any] exceptions as scan exceptions would silently
// disable policy-rule matching at the commit gate for 0.2.3 policies.
export function matchesScanException(
  filePath: string,
  exceptions: PolicyException[],
  baseDir: string = process.cwd()
): boolean {
  return exceptions.some((ex) => {
    if (!ex.path) return false;
    if (!ex.ops.includes("scan")) return false;
    return matchesExceptionPath(filePath, ex.path, baseDir, false);
  });
}
