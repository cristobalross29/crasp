#!/usr/bin/env node

import { Command } from "commander";
import { checkCommand } from "./commands/check.js";
import { hookCommand } from "./commands/hook.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { policyCommand } from "./commands/policy.js";
import { reportCommand } from "./commands/report.js";
import { runCommand } from "./commands/run.js";
import { scanCommand } from "./commands/scan.js";
import { setupCommand } from "./commands/setup.js";
import { statusCommand } from "./commands/status.js";
import { validateCommand } from "./commands/validate.js";
import { mcpCommand } from "./commands/mcp.js";
import { hookLogCommand } from "./commands/hook-log.js";

const program = new Command();

program
  .name("agentfence")
  .description("Local-first CLI for testing AI agent safety behavior")
  .version("0.1.0");

program
  .command("init")
  .description("scaffold scenario")
  .option("-f, --force", "overwrite existing starter files")
  .action(initCommand);

program
  .command("setup")
  .description("initialize AgentFence project configuration")
  .option("-f, --force", "overwrite existing AgentFence config")
  .action(setupCommand);

program
  .command("run <scenario>")
  .description("run a scenario")
  .option("-p, --policy <path>", "policy YAML file")
  .option("--format <format>", "terminal, json, or html", "terminal")
  .option("-o, --out <path>", "write report output to a file")
  .action(runCommand);

program.command("list").description("list past runs").action(listCommand);

program
  .command("check [paths...]")
  .description("check files for AgentFence policy matches")
  .option("--staged", "scan staged git files")
  .option("--stdin", "read content from stdin and check against policy")
  .option("--hook-input <tool>", "check a PreToolUse hook JSON payload from stdin (Write, Edit, Read)")
  .action(checkCommand);

program
  .command("scan [path]")
  .description("scan a file or directory")
  .option("-p, --policy <path>", "policy YAML file")
  .option("--format <format>", "terminal or json", "terminal")
  .option("--severity <severity>", "low, medium, high, or critical", "low")
  .action(scanCommand);

program
  .command("validate <scenario|policy> <file>")
  .description("validate a scenario or policy YAML file")
  .action(validateCommand);

program
  .command("status")
  .description("show AgentFence project status")
  .action(statusCommand);

program
  .command("hook <install|uninstall|status>")
  .description("manage the AgentFence pre-commit hook")
  .action(hookCommand);

program
  .command("policy <list|check> [text...]")
  .description("list policy rules or check freeform text")
  .action(policyCommand);

program
  .command("report <run-id>")
  .description("reprint a run report")
  .option("--format <format>", "terminal, json, or html", "terminal")
  .option("-o, --out <path>", "write report output to a file")
  .action(reportCommand);

program
  .command("mcp")
  .description("start the AgentFence MCP server (stdio transport)")
  .action(mcpCommand);

program
  .command("hook-log")
  .description("show AgentFence hook activity log")
  .option("--days <n>", "number of days to show (default: 2)", "2")
  .option("--summary", "print only the 30-day summary stats")
  .option("--json", "emit raw NDJSON lines to stdout")
  .option("--prune", "remove entries older than 90 days and exit")
  .action(hookLogCommand);

program.parse();
