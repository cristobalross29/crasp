export type BashTier = "advisory" | "ask";

export interface BashCommandResult {
  tier: BashTier;
  ruleId: string;
  message: string;
}

interface BashCommandRule {
  test: (command: string) => boolean;
  tier: BashTier;
  ruleId: string;
  describe: string;
}

const SECRET_FILE = /(\.env(?!\.(example|sample|template|dist)\b)(\.[^\s/\\]+)?\b|id_(rsa|dsa|ecdsa|ed25519)\b|\.aws[/\\]credentials\b|\.npmrc\b|\.ssh[/\\])/i;
const CAPTURED_SECRET = /\$\(\s*cat\b|\$\([^)]*(secret|token|key|password|cred)/i;
const NET_CMD = /\b(curl|wget|nc|ncat|scp|sftp|ftp|rsync|telnet)\b/i;
const LOCAL_HOST = /(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)/i;

// Covers combined (-rf, -fr, -Rf…) and separated (-r … -f) flag forms.
function hasRmRf(c: string): boolean {
  return (
    /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b/.test(c) ||
    /\brm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\b/.test(c) ||
    (/\brm\s+-r\b/.test(c) && /-f\b/.test(c)) ||
    (/\brm\s+-f\b/.test(c) && /-r\b/.test(c))
  );
}

// Order matters: checkBashCommand returns the FIRST match. Specific/dangerous
// rules (secret exfil) come before general ones (plain outbound fetch).
// Known v1 gaps (accepted): GNU long flags (rm --recursive --force), doas,
// symbolic chmod (a+rwx). Heuristic layer, not a shell parser.
const BASH_COMMAND_RULES: BashCommandRule[] = [
  {
    ruleId: "bash-secret-exfil",
    tier: "ask",
    describe: "This command appears to send secrets to a network destination.",
    test: (c) => NET_CMD.test(c) && (SECRET_FILE.test(c) || CAPTURED_SECRET.test(c)),
  },
  { ruleId: "bash-rm-rf", tier: "ask", describe: "Recursive force-delete (rm -rf).", test: hasRmRf },
  {
    ruleId: "bash-fork-bomb",
    tier: "ask",
    describe: "This looks like a fork bomb.",
    test: (c) => /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(c),
  },
  {
    ruleId: "bash-disk-write",
    tier: "ask",
    describe: "Direct write to a block device or filesystem format.",
    test: (c) => /\bdd\b[^|]*\bof=\/dev\//i.test(c) || /\bmkfs\b/i.test(c) || />\s*\/dev\/(sd|nvme|disk|hd)/i.test(c),
  },
  {
    ruleId: "bash-chmod-777",
    tier: "ask",
    describe: "World-writable permissions (chmod 777).",
    test: (c) => /\bchmod\s+(-[a-zA-Z]+\s+)*0?777\b/.test(c),
  },
  { ruleId: "bash-sudo", tier: "ask", describe: "Privilege escalation (sudo).", test: (c) => /(^|[;&|(]|&&|\|\|)\s*sudo\b/.test(c.trimStart()) },
  {
    ruleId: "bash-pipe-to-shell",
    tier: "ask",
    describe: "Piping a downloaded script straight into a shell.",
    test: (c) => /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|fish)\b/i.test(c),
  },
  {
    ruleId: "bash-force-push",
    tier: "ask",
    describe: "Force-pushing rewrites remote history.",
    test: (c) => /\bgit\s+push\b[^&|;]*(--force(?!-with-lease)\b|\s-f\b)/.test(c),
  },
  {
    ruleId: "bash-git-hard-reset",
    tier: "ask",
    describe: "Hard reset discards uncommitted work.",
    test: (c) => /\bgit\s+reset\s+--hard\b/.test(c),
  },
  {
    ruleId: "bash-history-wipe",
    tier: "ask",
    describe: "Clearing shell history can hide actions.",
    test: (c) => /\bhistory\s+-c\b/.test(c) || /\brm\b[^|;&]*\.(bash|zsh)_history\b/.test(c),
  },
  {
    ruleId: "bash-db-drop",
    tier: "ask",
    describe: "Dropping a database is destructive.",
    test: (c) => /\bDROP\s+DATABASE\b/i.test(c) || /\bdropdb\b/.test(c),
  },
  {
    ruleId: "bash-publish",
    tier: "ask",
    describe: "Publishing a package or release is outward-facing.",
    test: (c) => /\b(npm|yarn|pnpm)\s+publish\b/.test(c) || /\bgh\s+release\s+create\b/.test(c),
  },
  {
    ruleId: "bash-outbound-fetch",
    tier: "advisory",
    describe: "Outbound network fetch — data could leave your machine.",
    test: (c) => /\b(curl|wget)\b[^|]*https?:\/\//i.test(c) && !LOCAL_HOST.test(c),
  },
  {
    ruleId: "bash-read-secret",
    tier: "advisory",
    describe: "Reading a secret file to stdout.",
    test: (c) => /\b(cat|less|more|head|tail|echo|printf)\b[^|;&]*/.test(c) && SECRET_FILE.test(c),
  },
  {
    ruleId: "bash-global-install",
    tier: "advisory",
    describe: "Installing a global package.",
    test: (c) => /\bnpm\s+(i|install|add)\b[^|;&]*\s-g\b/.test(c) || /\b(pnpm|yarn)\s+(add|global)\b[^|;&]*\s-g\b/.test(c),
  },
];

const MAX_SCAN_LENGTH = 8192;
const MAX_DISPLAY_LENGTH = 200;

function displayCommand(command: string): string {
  return command.length > MAX_DISPLAY_LENGTH ? command.slice(0, MAX_DISPLAY_LENGTH) + "…" : command;
}

function buildMessage(rule: BashCommandRule, command: string): string {
  const icon = rule.tier === "ask" ? "⚠️  Crasp — Risky Command" : "ℹ️  Crasp — Notice";
  const approve =
    rule.tier === "ask"
      ? `\n\nApprove only if you intended this. To pre-approve similar commands, add to crasp.policy.yml:\n  exceptions:\n    - command: "<regex matching this command>"\n      ops: [bash]`
      : "";
  return `${icon}\n\n${rule.describe}\n\nCommand: ${displayCommand(command)}${approve}`;
}

export function checkBashCommand(command: string): BashCommandResult | null {
  if (!command) return null;
  const scanTarget = command.length > MAX_SCAN_LENGTH ? command.slice(0, MAX_SCAN_LENGTH) : command;
  for (const rule of BASH_COMMAND_RULES) {
    if (rule.test(scanTarget)) {
      return { tier: rule.tier, ruleId: rule.ruleId, message: buildMessage(rule, command) };
    }
  }
  return null;
}
