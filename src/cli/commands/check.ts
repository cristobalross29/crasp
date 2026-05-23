import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { printTerminalScanResults } from "../scan-output.js";
import { loadConfig } from "../../core/config/index.js";
import { loadPolicy, policyExists } from "../../core/policy/loader.js";
import { mergeWithBuiltin } from "../../core/patterns/index.js";
import { scanContent, scanDirectory, scanFiles } from "../../core/scanner/index.js";
import { checkSensitivePath } from "../../core/scanner/sensitive-paths.js";
import { matchesException } from "../../core/policy/exceptions.js";
import { appendHookLogEntry } from "../../core/hook-log/index.js";
import type { FileScanResult, Policy, Severity } from "../../types/index.js";
import type { HookTool } from "../../core/scanner/sensitive-paths.js";

const execFileAsync = promisify(execFile);

interface CheckOptions {
  staged?: boolean;
  stdin?: boolean;
  hookInput?: string;
}

export async function checkCommand(
  paths: string[] = [],
  options: CheckOptions = {}
): Promise<void> {
  if (options.hookInput) {
    await runHookInputCheck(options.hookInput as HookTool);
    return;
  }

  if (options.stdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const content = Buffer.concat(chunks).toString("utf8");

    const policy = await loadMergedPolicy();
    const result = scanContent(content, policy);
    const blocking = result.matches.filter(
      (m) => m.severity === "high" || m.severity === "critical"
    );

    if (blocking.length > 0) {
      for (const m of blocking) {
        process.stderr.write(
          `[agentfence] BLOCKED — ${m.ruleId} (${m.severity}): ${m.match}\n`
        );
      }
      process.exit(1);
    }
    process.exit(0);
  }

  const policy = await loadMergedPolicy();
  const filePaths = options.staged ? await stagedFiles() : paths;
  const results =
    options.staged || filePaths.length > 0
      ? await scanPathList(filePaths, policy)
      : await scanDirectory(process.cwd(), policy);

  printTerminalScanResults(results, {
    emptyMessage: (scannedFiles) =>
      `AgentFence check passed. Scanned ${scannedFiles} files.`,
    foundMessage: (totalMatches, matchedFiles) =>
      `AgentFence check found ${totalMatches} matches in ${matchedFiles} files.`
  });

  process.exitCode = hasSeverityAtOrAbove(results, "high") ? 1 : 0;
}

async function stagedFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync("git", [
    "diff",
    "--cached",
    "--name-only"
  ]);

  return stdout
    .split(/\r?\n/)
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

async function scanPathList(
  pathsToScan: string[],
  policy: Policy
): Promise<FileScanResult[]> {
  const results: FileScanResult[] = [];

  for (const pathToScan of pathsToScan) {
    const resolvedPath = path.resolve(pathToScan);
    let fileStat: Awaited<ReturnType<typeof stat>>;

    try {
      fileStat = await stat(resolvedPath);
    } catch (error) {
      results.push({
        filePath: resolvedPath,
        matches: [],
        scanned: false,
        error: error instanceof Error ? error.message : "Unable to stat path."
      });
      continue;
    }

    if (fileStat.isDirectory()) {
      results.push(...(await scanDirectory(resolvedPath, policy)));
      continue;
    }

    if (fileStat.isFile()) {
      results.push(...(await scanFiles([resolvedPath], policy)));
    }
  }

  return results;
}

async function loadMergedPolicy(): Promise<Policy> {
  const config = await loadConfig();
  const configuredPolicyPath = config?.policyPath
    ? path.resolve(config.policyPath)
    : path.resolve("agentfence.policy.yml");
  const userPolicy =
    configuredPolicyPath && (await policyExists(configuredPolicyPath))
      ? await loadPolicy(configuredPolicyPath)
      : undefined;

  return mergeWithBuiltin(userPolicy);
}

function hasSeverityAtOrAbove(
  results: FileScanResult[],
  threshold: Severity
): boolean {
  const severityRank: Record<Severity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3
  };

  return results.some((result) =>
    result.matches.some(
      (match) => severityRank[match.severity] >= severityRank[threshold]
    )
  );
}

async function runHookInputCheck(toolName: HookTool): Promise<void> {
  // Step 1: Read stdin and parse JSON payload
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    // Malformed JSON payload — fail open rather than false-blocking
    process.exit(0);
  }

  const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>;
  const filePath = (toolInput.file_path as string | undefined) ?? "";

  // Step 2: Load policy
  const policy = await loadMergedPolicy();

  // Step 3: Check exceptions — if the file+op is explicitly allowed, exit silently
  if (filePath && matchesException(filePath, toolName, policy.exceptions ?? [])) {
    await appendHookLogEntry(filePath, toolName, "exception");
    process.exit(0);
  }

  // Step 4: Sensitive path check with tier-based response
  const pathResult = checkSensitivePath(filePath, toolName);
  if (pathResult) {
    if (pathResult.tier === "advisory") {
      // Advisory: inject context into Claude's next message, then continue to content scan
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            additionalContext: pathResult.message,
          },
        })
      );
    } else {
      // high or critical: show ask dialog and exit
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: pathResult.message,
          },
        })
      );
      await appendHookLogEntry(filePath, toolName, "ask", pathResult.tier, pathResult.ruleId);
      process.exit(0);
    }
  }

  // Step 5: Content scan (Write and Edit only — Read has no content yet)
  let content = "";
  if (toolName === "Write") content = (toolInput.content as string | undefined) ?? "";
  else if (toolName === "Edit") content = (toolInput.new_string as string | undefined) ?? "";

  if (content) {
    const result = scanContent(content, policy);
    const blocking = result.matches.filter(
      (m) => m.severity === "high" || m.severity === "critical"
    );
    if (blocking.length > 0) {
      const reasons = blocking
        .map((m) => `${m.ruleId} (${m.severity}): ${m.match}`)
        .join("; ");
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `[agentfence] content policy violation — ${reasons}`,
          },
        })
      );
      await appendHookLogEntry(filePath, toolName, "denied", undefined, blocking[0].ruleId);
      process.exit(0);
    }
  }

  // Step 6: All checks passed
  if (pathResult?.tier === "advisory") {
    await appendHookLogEntry(filePath, toolName, "advisory", "advisory", pathResult.ruleId);
  } else {
    await appendHookLogEntry(filePath, toolName, "clean");
  }
  process.exit(0);
}
