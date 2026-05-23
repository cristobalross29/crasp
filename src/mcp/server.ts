import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../core/config/index.js";
import { loadPolicy, policyExists } from "../core/policy/loader.js";
import { mergeWithBuiltin } from "../core/patterns/index.js";
import { handleCheck } from "./tools/check.js";
import { handleScan } from "./tools/scan.js";
import { handlePolicy } from "./tools/policy.js";

async function loadActivePolicy() {
  const config = await loadConfig();
  const policyPath = config?.policyPath
    ? path.resolve(config.policyPath)
    : path.resolve("crasp.policy.yml");
  const userPolicy = (await policyExists(policyPath))
    ? await loadPolicy(policyPath)
    : undefined;
  return mergeWithBuiltin(userPolicy);
}

export async function startMcpServer(): Promise<void> {
  const policy = await loadActivePolicy();
  const server = new McpServer({ name: "crasp", version: "0.1.0" });

  server.tool(
    "crasp_check",
    "Check text content against the Crasp safety policy. Returns violations and a recommended action: allow (no violations), warn (low/medium severity), or block (high/critical severity). Call this before writing files, committing code, or executing commands.",
    {
      content: z
        .string()
        .describe("The text content to check against the safety policy."),
      context: z
        .enum(["agent_output", "file_content", "user_input"])
        .optional()
        .describe(
          "Optional context label for the content (agent_output, file_content, or user_input)."
        ),
    },
    async ({ content, context }) => {
      const result = await handleCheck({ content, context }, policy);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "crasp_scan",
    "Scan a file or directory for safety policy violations. Returns matches by file with rule ID, severity, and line location. Use to audit generated code before committing or to check a directory for leaked secrets.",
    {
      path: z
        .string()
        .describe("Absolute or relative path to a file or directory to scan."),
      recursive: z
        .boolean()
        .optional()
        .describe("Recursively scan subdirectories. Defaults to true."),
    },
    async ({ path: scanPath, recursive }) => {
      const result = await handleScan({ path: scanPath, recursive }, policy);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "crasp_policy",
    "Get the active Crasp policy rules. Returns rule IDs, descriptions, severity levels, and patterns. Use to understand what is being enforced before performing sensitive operations.",
    {},
    async () => {
      const result = await handlePolicy(policy);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
