import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  FileScanMatch,
  FileScanResult,
  Policy,
  ScanSummary,
  Severity
} from "../../types/index.js";

export interface ScanDirectoryOptions {
  recursive?: boolean;
  include?: string[];
  exclude?: string[];
  maxFileBytes?: number;
}

const defaultExcludedDirs = new Set([
  ".agentfence",
  ".cache",
  ".claude",
  ".codex",
  ".cursor",
  ".git",
  ".gstack",
  ".next",
  ".pytest_cache",
  ".ruff_cache",
  ".swc",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "graphify-out",
  "node_modules",
  "scenarios"
]);

const defaultExcludedFiles = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  "agentfence.policy.yml",
  "agentfence.policy.yaml",
  "tsconfig.tsbuildinfo"
]);

const DEFAULT_MAX_FILE_BYTES = 1_000_000;

const severityCounts = (): Record<Severity, number> => ({
  low: 0,
  medium: 0,
  high: 0,
  critical: 0
});

export function scanContent(
  content: string,
  policy: Policy,
  filePath = "<memory>"
): FileScanResult {
  const matches: FileScanMatch[] = [];

  for (const rule of policy.rules) {
    const pattern = new RegExp(rule.pattern, "gi");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const value = match[0];
      const position = contentPosition(content, match.index);

      matches.push({
        ruleId: rule.id,
        ruleName: rule.description,
        severity: rule.severity,
        line: position.line,
        column: position.column,
        match: value,
        context: lineAt(content, position.line)
      });

      if (value.length === 0) {
        pattern.lastIndex += 1;
      }
    }
  }

  return {
    filePath,
    matches,
    scanned: true
  };
}

export async function scanFile(
  filePath: string,
  policy: Policy,
  options: Pick<ScanDirectoryOptions, "maxFileBytes"> = {}
): Promise<FileScanResult> {
  try {
    const fileStat = await stat(filePath);
    const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

    if (fileStat.size > maxFileBytes) {
      return {
        filePath,
        matches: [],
        scanned: false,
        error: `Skipped file larger than ${maxFileBytes} bytes.`
      };
    }

    const content = await readFile(filePath, "utf8");
    return scanContent(content, policy, filePath);
  } catch (error) {
    return {
      filePath,
      matches: [],
      scanned: false,
      error: error instanceof Error ? error.message : "Unable to scan file."
    };
  }
}

export async function scanFiles(
  filePaths: string[],
  policy: Policy,
  options: Pick<ScanDirectoryOptions, "maxFileBytes"> = {}
): Promise<FileScanResult[]> {
  return Promise.all(
    filePaths.map((filePath) => scanFile(filePath, policy, options))
  );
}

export async function scanDirectory(
  dirPath: string,
  policy: Policy,
  options: ScanDirectoryOptions = {}
): Promise<FileScanResult[]> {
  const files = await collectFiles(dirPath, options);
  return scanFiles(files, policy, options);
}

export function summarizeScanResults(results: FileScanResult[]): ScanSummary {
  const bySeverity = severityCounts();
  let totalMatches = 0;

  for (const result of results) {
    for (const match of result.matches) {
      bySeverity[match.severity] += 1;
      totalMatches += 1;
    }
  }

  return {
    totalFiles: results.length,
    scannedFiles: results.filter((result) => result.scanned).length,
    matchedFiles: results.filter((result) => result.matches.length > 0).length,
    totalMatches,
    bySeverity
  };
}

async function collectFiles(
  dirPath: string,
  options: ScanDirectoryOptions
): Promise<string[]> {
  const recursive = options.recursive ?? true;
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!recursive || shouldExcludeDirectory(entry.name, options.exclude)) {
        continue;
      }

      files.push(...(await collectFiles(entryPath, options)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (shouldExcludeFile(entry.name, options.exclude)) {
      continue;
    }

    if (!isIncluded(entryPath, options.include, options.exclude)) {
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

function shouldExcludeDirectory(name: string, exclude: string[] = []): boolean {
  return defaultExcludedDirs.has(name) || exclude.includes(name);
}

function shouldExcludeFile(name: string, exclude: string[] = []): boolean {
  return defaultExcludedFiles.has(name) || exclude.includes(name);
}

function isIncluded(
  filePath: string,
  include: string[] = [],
  exclude: string[] = []
): boolean {
  const normalized = filePath.split(path.sep).join("/");

  if (exclude.some((pattern) => normalized.includes(pattern))) {
    return false;
  }

  if (include.length === 0) {
    return true;
  }

  return include.some((pattern) => normalized.includes(pattern));
}

function contentPosition(
  content: string,
  index: number
): { line: number; column: number } {
  const prefix = content.slice(0, index);
  const lines = prefix.split("\n");

  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

function lineAt(content: string, line: number): string {
  return content.split("\n")[line - 1]?.trim() ?? "";
}
