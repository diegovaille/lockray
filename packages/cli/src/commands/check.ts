import { Command } from "commander";
import { NpmAnalyzer } from "@lockray/analyzer-npm";
import type { DependencyChange, Finding, ProjectInput } from "@lockray/types";
import { discoverProjects } from "../change-detection/discovery.js";
import { makeGitShow } from "../change-detection/git-show.js";
import { createPacoteFetcher } from "../tarball/pacote-fetcher.js";
import { createHttpOsvClient } from "../cve/http-osv-client.js";

export type CheckFormat = "json" | "pretty";

interface CheckOptions {
  base: string;
  head: string;
  cwd: string;
  format: string;
}

export interface WorkspaceResult {
  workspace: string;
  ecosystem: "npm" | "pypi";
  parseOutcome: ProjectInput["parseOutcome"];
  changes: DependencyChange[];
  findings: Finding[];
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
      const fetcher = createPacoteFetcher();
      const osv = createHttpOsvClient();
      const analyzer = new NpmAnalyzer({ gitShow, fetcher, osv });

      const workspaces: WorkspaceResult[] = [];
      for (const project of projects) {
        if (project.ecosystem !== "npm") continue;
        if (project.parseOutcome !== "fully-supported") {
          workspaces.push({
            workspace: project.workspaceName,
            ecosystem: project.ecosystem,
            parseOutcome: project.parseOutcome,
            changes: [],
            findings: [],
          });
          continue;
        }
        const changes = await analyzer.resolveChanges(project, opts.base, opts.head);
        const findings: Finding[] = [];
        // NOTE: tarball fetch failures are swallowed inside runAnalyze's
        // fetchSafely helper; OSV errors currently propagate fatally and
        // abort the CLI run. M3's PR-checker mode will want OSV errors
        // wrapped similarly so partial progress survives network blips.
        for (const change of changes) {
          const f = await analyzer.analyze(change, "hybrid");
          findings.push(...f);
        }
        workspaces.push({
          workspace: project.workspaceName,
          ecosystem: project.ecosystem,
          parseOutcome: project.parseOutcome,
          changes,
          findings,
        });
      }

      const allChanges = workspaces.flatMap((w) => w.changes);
      const allFindings = workspaces.flatMap((w) => w.findings);
      const blocked = allFindings.some((f) => f.hardFail === true);

      if (opts.format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              base: opts.base,
              head: opts.head,
              workspaces,
              changes: allChanges,
              findings: allFindings,
              blocked,
            },
            null,
            2,
          ) + "\n",
        );
      } else {
        renderPretty(opts.base, opts.head, workspaces, blocked);
      }
    });
  return cmd;
}

function renderPretty(
  base: string,
  head: string,
  workspaces: WorkspaceResult[],
  blocked: boolean,
): void {
  const out = process.stdout;
  out.write(`🔍 LockRay — dependency risk report\n`);
  out.write(`Base: ${base}  Head: ${head}\n\n`);
  out.write(blocked ? `Verdict: ❌ BLOCKED\n\n` : `Verdict: ⚠ review findings below\n\n`);
  for (const ws of workspaces) {
    out.write(`Workspace: ${ws.workspace} (${ws.ecosystem}, ${ws.parseOutcome})\n`);
    if (ws.changes.length === 0) {
      out.write(`  no dependency changes detected\n\n`);
      continue;
    }
    out.write(`  changes: ${ws.changes.length}, findings: ${ws.findings.length}\n`);
    for (const f of ws.findings) {
      const mark = f.hardFail ? "❌" : f.severity === "critical" ? "🚨" : "⚠ ";
      out.write(`    ${mark} ${f.code}  ${f.packageName}@${f.packageVersion}  (${f.severity})\n`);
      for (const e of f.evidence) {
        if (e.metadataField) {
          out.write(`       - ${e.metadataField}: ${String(e.oldValue ?? "∅")} → ${String(e.newValue ?? "∅")}\n`);
        } else if (e.advisoryId) {
          out.write(`       - advisory: ${e.advisoryId}\n`);
        }
      }
    }
    out.write("\n");
  }
}
