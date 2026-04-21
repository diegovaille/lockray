import { Command } from "commander";
import { NpmAnalyzer } from "@lockray/analyzer-npm";
import type { DependencyChange, ProjectInput } from "@lockray/types";
import { discoverProjects } from "../change-detection/discovery.js";
import { makeGitShow } from "../change-detection/git-show.js";

export type CheckFormat = "json" | "pretty";

interface CheckOptions {
  base: string;
  head: string;
  cwd: string;
  format: string; // validated to CheckFormat at runtime inside the action
}

export interface WorkspaceResult {
  workspace: string;
  ecosystem: "npm" | "pypi";
  parseOutcome: ProjectInput["parseOutcome"];
  changes: DependencyChange[];
}

export function buildCheckCommand(): Command {
  const cmd = new Command("check");
  cmd
    .description("Analyze dependency changes between two git refs")
    .option("--base <ref>", "Base git ref (PR target)", "origin/main")
    .option("--head <ref>", "Head git ref (PR branch)", "HEAD")
    .option("--cwd <path>", "Repo root to scan", process.cwd())
    .option("--format <fmt>", "Output format: json | pretty", "pretty")
    .action(async (opts: CheckOptions) => {
      if (opts.format !== "json" && opts.format !== "pretty") {
        process.stderr.write(
          `lockray: unknown --format value "${opts.format}"; expected "json" or "pretty"\n`,
        );
        process.exit(1);
      }

      const projects = await discoverProjects(opts.cwd);
      const gitShow = makeGitShow(opts.cwd);
      const npmAnalyzer = new NpmAnalyzer(gitShow);

      const workspaces: WorkspaceResult[] = [];
      for (const project of projects) {
        if (project.ecosystem !== "npm") continue;
        if (project.parseOutcome !== "fully-supported") {
          workspaces.push({
            workspace: project.workspaceName,
            ecosystem: project.ecosystem,
            parseOutcome: project.parseOutcome,
            changes: [],
          });
          continue;
        }
        const changes = await npmAnalyzer.resolveChanges(
          project,
          opts.base,
          opts.head,
        );
        workspaces.push({
          workspace: project.workspaceName,
          ecosystem: project.ecosystem,
          parseOutcome: project.parseOutcome,
          changes,
        });
      }

      const allChanges = workspaces.flatMap((w) => w.changes);

      if (opts.format === "json") {
        process.stdout.write(
          JSON.stringify(
            { base: opts.base, head: opts.head, workspaces, changes: allChanges },
            null,
            2,
          ) + "\n",
        );
      } else {
        renderPretty(opts.base, opts.head, workspaces);
      }
    });
  return cmd;
}

function renderPretty(
  base: string,
  head: string,
  workspaces: WorkspaceResult[],
): void {
  const out = process.stdout;
  out.write(`🔍 LockRay — change detection\n`);
  out.write(`Base: ${base}  Head: ${head}\n\n`);
  for (const ws of workspaces) {
    out.write(`Workspace: ${ws.workspace} (${ws.ecosystem}, ${ws.parseOutcome})\n`);
    if (ws.changes.length === 0) {
      out.write(`  no dependency changes detected\n\n`);
      continue;
    }
    for (const c of ws.changes) {
      const tag = c.direct ? "direct" : "transitive";
      const from = c.fromVersion ?? "(added)";
      const to = c.toVersion ?? "(removed)";
      const flags: string[] = [];
      if (c.integrityChanged) flags.push("integrity-changed");
      if (c.sourceChanged) flags.push("source-changed");
      const flagStr = flags.length > 0 ? `  [${flags.join(", ")}]` : "";
      out.write(`  ${c.name}  ${from} → ${to}  [${tag}]${flagStr}\n`);
    }
    out.write("\n");
  }
}
