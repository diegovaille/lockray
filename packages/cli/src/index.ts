import { Command } from "commander";
import { buildCheckCommand } from "./commands/check.js";

export { LockrayError } from "@lockray/types";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("lockray")
    .description("Behavioral diff analysis for dependency PRs")
    .version("0.0.0");
  program.addCommand(buildCheckCommand());
  return program;
}

export async function main(argv: string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`lockray: ${msg}\n`);
    return 1;
  }
}
