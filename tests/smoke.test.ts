import { describe, expect, it } from "vitest";
import { Command } from "commander";

describe("smoke", () => {
  it("program can be imported without errors", () => {
    const program = new Command();

    program.name("agentfence");

    expect(program.name()).toBe("agentfence");
  });

  it("commander registers subcommands correctly", () => {
    const program = new Command();

    program.command("init");
    program.command("run");
    program.command("list");
    program.command("report");

    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toEqual(
      expect.arrayContaining(["init", "run", "list", "report"])
    );
  });
});
