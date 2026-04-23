import { Command } from "commander";
import { NpmAnalyzer } from "@lockray/analyzer-npm";
import type { CliWorkspaceReport, Finding, PrReport } from "@lockray/types";
import { score } from "@lockray/scoring";
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

// The shared shape lives in @lockray/types as CliWorkspaceReport; alias
// here to keep the existing `WorkspaceResult` identifier stable for any
// downstream importers.
export type WorkspaceResult = CliWorkspaceReport;

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

      const prReport = score({
        base: opts.base,
        head: opts.head,
        findings: allFindings,
        workspaces,
        totalChangedPackages: allChanges.length,
      });
      // Backwards-compatible view for v0.2.x consumers.
      const blocked = prReport.verdict === "block";

      if (opts.format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              ...prReport,
              // v0.2 backwards-compat views — drop in v1.0 after
              // downstream consumers migrate to verdict + packages.
              // NOTE: compat fields stay AFTER the spread; if a future
              // PrReport schema adds a field named changes/findings/
              // blocked it would be silently shadowed by the compat
              // value here. Rename the compat key if that ever happens.
              changes: allChanges,
              findings: allFindings,
              blocked,
            },
            null,
            2,
          ) + "\n",
        );
      } else {
        renderPretty(opts.base, opts.head, workspaces, prReport);
      }
    });
  return cmd;
}

function truncate(value: string, max = 64): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function renderPretty(
  base: string,
  head: string,
  workspaces: WorkspaceResult[],
  prReport: PrReport,
): void {
  const out = process.stdout;
  const unanalyzedCount = workspaces.filter(
    (w) =>
      w.parseOutcome === "missing" ||
      w.parseOutcome === "invalid" ||
      w.parseOutcome === "unsupported",
  ).length;
  out.write(`🔍 LockRay — dependency risk report\n`);
  out.write(`Base: ${base}  Head: ${head}\n\n`);

  if (prReport.verdict === "block") {
    out.write(`Verdict: ❌ BLOCKED — score ${prReport.prScore}/100\n`);
  } else if (prReport.verdict === "review") {
    out.write(`Verdict: ⚠ review — score ${prReport.prScore}/100\n`);
  } else if (unanalyzedCount > 0) {
    out.write(
      `Verdict: ⚠ incomplete — ${unanalyzedCount} workspace(s) not analyzed; see notes below\n`,
    );
  } else {
    out.write(
      `Verdict: ✅ no high-confidence risk signals found (score ${prReport.prScore}/100)\n`,
    );
  }
  out.write(
    `${prReport.flaggedPackageCount} flagged · ${prReport.blockCount} block · ${prReport.reviewCount} review · risk density ${prReport.riskDensity}\n\n`,
  );

  for (const ws of workspaces) {
    out.write(`Workspace: ${ws.workspace} (${ws.ecosystem}, ${ws.parseOutcome})\n`);
    if (
      ws.parseOutcome === "missing" ||
      ws.parseOutcome === "invalid" ||
      ws.parseOutcome === "unsupported"
    ) {
      // Spec §15: never imply safety for inputs we didn't actually analyze.
      out.write(
        `  workspace not analyzed (parse outcome: ${ws.parseOutcome})\n\n`,
      );
      continue;
    }
    if (ws.changes.length === 0) {
      out.write(`  no dependency changes detected\n\n`);
      continue;
    }

    // What changed — list every dependency change, even ones with no findings,
    // so a reviewer can see the surface LockRay examined.
    out.write(`  Dependency changes (${ws.changes.length}):\n`);
    for (const c of ws.changes) {
      const from = c.fromVersion ?? "(added)";
      const to = c.toVersion ?? "(removed)";
      const tag = c.direct ? "direct" : "transitive";
      const flags: string[] = [];
      if (c.integrityChanged) flags.push("integrity changed");
      if (c.sourceChanged) flags.push("source changed");
      const flagStr = flags.length > 0 ? `  [${flags.join(", ")}]` : "";
      out.write(`    • ${c.name}  ${from} → ${to}  (${tag})${flagStr}\n`);
    }

    if (ws.findings.length === 0) {
      out.write(`  No findings.\n\n`);
      continue;
    }

    // Why LockRay is worried + evidence — group by finding, show title + hint.
    out.write(`\n  Findings (${ws.findings.length}):\n`);
    for (const f of ws.findings) {
      const mark = f.hardFail ? "❌" : f.severity === "critical" ? "🚨" : "⚠ ";
      const tag = f.hardFail ? `${f.severity}, hard-fail` : f.severity;
      out.write(`    ${mark} ${f.packageName}@${f.packageVersion} — ${f.title}\n`);
      out.write(`       rule: ${f.code}  (${tag})\n`);
      for (const e of f.evidence) {
        if (e.metadataField && (e.oldValue !== undefined || e.newValue !== undefined)) {
          const before = truncate(String(e.oldValue ?? "∅"));
          const after = truncate(String(e.newValue ?? "∅"));
          out.write(`       evidence: ${e.metadataField}\n`);
          out.write(`         before: ${before}\n`);
          out.write(`         after:  ${after}\n`);
        } else if (e.registryUrl || e.oldValue || e.newValue) {
          const before = truncate(String(e.oldValue ?? "∅"));
          const after = truncate(String(e.newValue ?? e.registryUrl ?? "∅"));
          out.write(`       evidence: resolved source\n`);
          out.write(`         before: ${before}\n`);
          out.write(`         after:  ${after}\n`);
        } else if (e.advisoryId) {
          out.write(`       advisory: ${e.advisoryId}`);
          if (e.confidenceReason) out.write(` — ${e.confidenceReason}`);
          out.write(`\n`);
        } else if (e.confidenceReason) {
          out.write(`       matched: ${e.confidenceReason}\n`);
        }
        if (e.remediationHint) {
          out.write(`       fix: ${e.remediationHint}\n`);
        }
      }
    }
    out.write("\n");
  }
}
