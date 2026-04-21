import { Command } from "commander";

export function buildCheckCommand(): Command {
  const cmd = new Command("check");
  cmd
    .description("Analyze dependency changes between two git refs")
    .option("--base <ref>", "Base git ref (PR target)", "origin/main")
    .option("--head <ref>", "Head git ref (PR branch)", "HEAD")
    .option("--cwd <path>", "Repo root to scan", process.cwd())
    .option("--format <fmt>", "Output format: json | pretty", "pretty")
    .action(async (opts: { base: string; head: string; cwd: string; format: string }) => {
      process.stdout.write(
        JSON.stringify({ status: "stub", received: opts }, null, 2) + "\n",
      );
    });
  return cmd;
}
