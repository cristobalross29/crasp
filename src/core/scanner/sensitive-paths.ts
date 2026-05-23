import path from "node:path";

export type SensitivePathTier = "advisory" | "high" | "critical";

export interface SensitivePathResult {
  tier: SensitivePathTier;
  ruleId: string;
  message: string;
}

export type HookTool = "Write" | "Edit" | "Read";

interface SensitivePathRule {
  test: (basename: string, fullPath: string) => boolean;
  writeTier: SensitivePathTier;
  readTier: SensitivePathTier;
  ruleId: string;
  buildWriteMessage: (basename: string) => string;
  buildReadMessage: (basename: string) => string;
}

// Template/example env files are safe to read and write
const ENV_TEMPLATE_SUFFIXES = /\.(example|sample|template|dist)$/i;

const SENSITIVE_PATH_RULES: SensitivePathRule[] = [
  {
    // .env, .env.local, .env.production, .env.production.local, etc.
    // Excludes .env.example, .env.sample, .env.template, .env.dist
    test: (name) =>
      /^\.env(\.[^/\\]+)?$/.test(name) && !ENV_TEMPLATE_SUFFIXES.test(name),
    writeTier: "high",
    readTier: "advisory",
    ruleId: "sensitive-env-file",
    buildWriteMessage: (basename) =>
      `⚠️  AgentFence Warning\n\nWriting to ${basename} — this file likely contains API keys and secrets.\nAccidentally modifying it could expose credentials or break your app.\n\nTo pre-approve this, add to agentfence.policy.yml:\n  exceptions:\n    - path: "${basename}"\n      ops: [write, edit]`,
    buildReadMessage: (basename) =>
      `AgentFence: You are reading ${basename}, which likely contains secrets (API keys, passwords, tokens). Please tell the user: "AgentFence flagged this file as sensitive — I'll make sure not to include any secret values in my response."`,
  },
  {
    // Private keys and certificates
    test: (name) =>
      /\.(pem|key|p12|pfx|jks)$/i.test(name) ||
      /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(name),
    writeTier: "critical",
    readTier: "critical",
    ruleId: "sensitive-key-file",
    buildWriteMessage: (basename) =>
      `🚨  AgentFence — Critical Security Risk\n\nAccessing ${basename} — this is a cryptographic private key or certificate.\nThis file could compromise your server's identity and all SSL connections.\n\nThis is a HIGH RISK action. Only proceed if you are certain.\n\nTo pre-approve this, add to agentfence.policy.yml:\n  exceptions:\n    - path: "${basename}"\n      ops: [any]`,
    buildReadMessage: (basename) =>
      `🚨  AgentFence — Critical Security Risk\n\nAccessing ${basename} — this is a cryptographic private key or certificate.\nThis file could compromise your server's identity and all SSL connections.\n\nThis is a HIGH RISK action. Only proceed if you are certain.\n\nTo pre-approve this, add to agentfence.policy.yml:\n  exceptions:\n    - path: "${basename}"\n      ops: [any]`,
  },
  {
    // AWS/cloud credentials files
    test: (_name, fullPath) =>
      /[/\\]\.aws[/\\]credentials$/i.test(fullPath) ||
      /[/\\]\.gcloud[/\\]credentials\.db$/i.test(fullPath),
    writeTier: "high",
    readTier: "advisory",
    ruleId: "sensitive-cloud-credentials",
    buildWriteMessage: (basename) =>
      `⚠️  AgentFence Warning\n\nWriting to ${basename} — this file likely contains API keys and secrets.\nAccidentally modifying it could expose credentials or break your app.\n\nTo pre-approve this, add to agentfence.policy.yml:\n  exceptions:\n    - path: "${basename}"\n      ops: [write, edit]`,
    buildReadMessage: (basename) =>
      `AgentFence: You are reading ${basename}, which likely contains secrets (API keys, passwords, tokens). Please tell the user: "AgentFence flagged this file as sensitive — I'll make sure not to include any secret values in my response."`,
  },
];

export function checkSensitivePath(
  filePath: string,
  op: HookTool
): SensitivePathResult | null {
  if (!filePath) return null;

  const basename = path.basename(filePath);

  for (const rule of SENSITIVE_PATH_RULES) {
    if (!rule.test(basename, filePath)) continue;

    const tier = op === "Read" ? rule.readTier : rule.writeTier;
    const message =
      op === "Read"
        ? rule.buildReadMessage(basename)
        : rule.buildWriteMessage(basename);

    return {
      tier,
      ruleId: rule.ruleId,
      message,
    };
  }

  return null;
}
