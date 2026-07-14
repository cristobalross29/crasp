import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  FileScanMatch,
  FileScanResult,
  Policy,
  ScanSummary,
  Severity
} from "../../types/index.js";
import { detectSecrets, maskSpan, maskSpanInLine } from "./secrets.js";
import { matchesScanException } from "../policy/exceptions.js";

const RULE_NAMES: Record<string, string> = {
  "secret-aws-akia": "AWS access key",
  "secret-anthropic": "Anthropic API key",
  "secret-openai": "OpenAI API key",
  "secret-github": "GitHub token",
  "secret-gitlab": "GitLab personal access token",
  "secret-stripe": "Stripe secret key",
  "secret-stripe-webhook": "Stripe webhook secret",
  "secret-google-api": "Google API key",
  "secret-google-oauth": "Google OAuth credential",
  "secret-azure": "Azure client secret",
  "secret-slack": "Slack token",
  "secret-slack-webhook": "Slack webhook URL",
  "secret-sendgrid": "SendGrid API key",
  "secret-twilio": "Twilio credential",
  "secret-huggingface": "HuggingFace token",
  "secret-npm": "npm access token",
  "secret-pypi": "PyPI token",
  "secret-digitalocean": "DigitalOcean token",
  "secret-datadog": "Datadog API key",
  "secret-cloudflare": "Cloudflare token",
  "secret-shopify": "Shopify access token",
  "secret-square": "Square access token",
  "secret-db-conn": "Database connection string with credentials",
  "secret-url-creds": "URL-embedded credentials",
  "secret-pem": "PEM/SSH private key",
  "secret-jwt": "JSON Web Token",
};

function ruleNameFor(ruleId: string): string {
  return RULE_NAMES[ruleId] ?? ruleId;
}

export interface ScanDirectoryOptions {
  recursive?: boolean;
  include?: string[];
  exclude?: string[];
  maxFileBytes?: number;
  /** Base directory for matching relative exception path globs (default: cwd). */
  baseDir?: string;
}

const defaultExcludedDirs = new Set([
  ".crasp",
  ".cache",
  ".claude",
  ".codex",
  ".cursor",
  ".git",
  ".next",
  ".pytest_cache",
  ".ruff_cache",
  ".swc",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "scenarios"
]);

const defaultExcludedFiles = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  "crasp.policy.yml",
  "crasp.policy.yaml",
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
    const pattern = new RegExp(rule.pattern, rule.caseSensitive ? "g" : "gi");
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

  for (const f of detectSecrets(content, filePath, policy.secrets?.allowlist)) {
    const pos = contentPosition(content, f.index);
    matches.push({
      ruleId: f.ruleId,
      ruleName: ruleNameFor(f.ruleId),
      severity: f.severity,
      line: pos.line,
      column: pos.column,
      match: maskSpan(content, f.index, f.length),
      context: maskSpanInLine(content, f.index, f.length, pos.line - 1),
    });
  }

  return {
    filePath,
    matches,
    scanned: true
  };
}

/**
 * Scan already-loaded content, honoring the policy's scan exceptions: for an
 * excepted path, policy-rule matching is suppressed but secret detection still
 * runs, and the result is marked `excepted`.
 */
export function scanContentWithExceptions(
  content: string,
  filePath: string,
  policy: Policy,
  baseDir?: string,
  forceExcepted = false
): FileScanResult {
  const excepted =
    forceExcepted ||
    matchesScanException(filePath, policy.exceptions ?? [], baseDir);
  const result = scanContent(
    content,
    excepted ? { ...policy, rules: [] } : policy,
    filePath
  );
  return excepted ? { ...result, excepted: true } : result;
}

export async function scanFile(
  filePath: string,
  policy: Policy,
  options: Pick<ScanDirectoryOptions, "maxFileBytes" | "baseDir"> = {}
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
    return scanContentWithExceptions(content, filePath, policy, options.baseDir);
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
  options: Pick<ScanDirectoryOptions, "maxFileBytes" | "baseDir"> = {}
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
    exceptedFiles: results.filter((result) => result.scanned && result.excepted)
      .length,
    bySeverity
  };
}

/**
 * True when a repo-relative path is one the directory walker skips by default —
 * a self-referential/template file or anything under a default-excluded
 * directory. Staged scans use this to suppress policy rules (secrets still
 * scan) so the commit gate agrees with `crasp check`/`crasp scan` on the same tree.
 */
export function isDefaultExcludedPath(relPath: string): boolean {
  const segments = relPath.split(/[\\/]/).filter(Boolean);
  if (segments.length === 0) return false;
  if (defaultExcludedFiles.has(segments[segments.length - 1])) return true;
  return segments.slice(0, -1).some((dir) => defaultExcludedDirs.has(dir));
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
