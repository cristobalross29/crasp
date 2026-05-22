#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { reportCommand } from "./commands/report.js";
import { runCommand } from "./commands/run.js";

const program = new Command();

program
  .name("agentfence")
  .description("Local-first CLI for testing AI agent safety behavior")
  .version("0.1.0");

program.command("init").description("scaffold scenario").action(initCommand);

program.command("run <scenario>").description("run a scenario").action(runCommand);

program.command("list").description("list past runs").action(listCommand);

program
  .command("report <run-id>")
  .description("reprint a run report")
  .action(reportCommand);

program.parse();
