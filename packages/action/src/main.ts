import * as core from "@actions/core";
import * as github from "@actions/github";
import * as exec from "@actions/exec";
import * as artifact from "@actions/artifact";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliReport } from "@lockray/types";
import { runAnalyzeJob, type ExecFn, type UploadArtifactFn, type WriteFileFn } from "./analyze.js";
import { runReportJob } from "./report.js";
import type { ActionInputs } from "./types.js";

function readInputs(): ActionInputs {
  const mode = core.getInput("mode") || "analyze";
  if (mode !== "analyze" && mode !== "report") {
    throw new Error(`invalid "mode" input: ${mode}. Expected "analyze" or "report".`);
  }
  return {
    mode,
    workdir: core.getInput("workdir") || process.cwd(),
    base: core.getInput("base") || "origin/main",
    head: core.getInput("head") || "HEAD",
    failOnRisk: core.getBooleanInput("fail-on-risk"),
    artifactName: core.getInput("artifact-name") || "lockray-report",
    workflowRunId: Number.parseInt(core.getInput("workflow-run-id") || "0", 10) || null,
    prNumber: Number.parseInt(core.getInput("pr-number") || "0", 10) || null,
    githubToken: core.getInput("github-token"),
  };
}

const execFn: ExecFn = (cmd, args, opts) => exec.exec(cmd, args, opts);

const writeFn: WriteFileFn = async (path, content) => {
  await writeFile(path, content, "utf8");
};

function makeArtifactClient(): { uploadArtifact: UploadArtifactFn } {
  const client = new artifact.DefaultArtifactClient();
  return {
    uploadArtifact: async (name, files, rootDirectory) => {
      const result = await client.uploadArtifact(name, files, rootDirectory);
      return { id: result.id ?? 0 };
    },
  };
}

async function runAnalyzeMode(inputs: ActionInputs): Promise<number> {
  const ctx = github.context;
  const prNumber = ctx.payload.pull_request?.number ?? inputs.prNumber ?? 0;
  const headSha = ctx.payload.pull_request?.head?.sha ?? ctx.sha;
  const runId = ctx.runId;

  const { uploadArtifact } = makeArtifactClient();
  const { report, exitCode } = await runAnalyzeJob(inputs, {
    exec: execFn,
    writeFile: writeFn,
    uploadArtifact,
    prNumber,
    runId,
    headSha,
  });

  core.setOutput("blocked", String(report.blocked));
  core.setOutput("finding-count", String(report.findings.length));

  if (report.blocked && inputs.failOnRisk) {
    core.setFailed(`LockRay BLOCKED: ${report.findings.length} finding(s); see uploaded report artifact.`);
    return 1;
  }
  if (exitCode !== 0 && inputs.failOnRisk) {
    core.setFailed(`lockray CLI exited ${exitCode}`);
    return exitCode;
  }
  return 0;
}

async function runReportMode(inputs: ActionInputs): Promise<number> {
  if (!inputs.githubToken) throw new Error("report mode requires github-token");
  if (!inputs.workflowRunId) throw new Error("report mode requires workflow-run-id");

  const client = new artifact.DefaultArtifactClient();
  const octokit = github.getOctokit(inputs.githubToken);

  // List artifacts for the triggering workflow_run, locate the report + metadata.
  const { owner, repo } = github.context.repo;
  const runArtifacts = await octokit.rest.actions.listWorkflowRunArtifacts({
    owner,
    repo,
    run_id: inputs.workflowRunId,
  });
  const reportArtifact = runArtifacts.data.artifacts.find((a) => a.name === inputs.artifactName);
  const metadataArtifact = runArtifacts.data.artifacts.find((a) => a.name === `${inputs.artifactName}-metadata`);
  if (!reportArtifact || !metadataArtifact) {
    throw new Error(`could not locate artifacts on run ${inputs.workflowRunId}`);
  }

  const downloadDir = process.env.RUNNER_TEMP ?? "/tmp";
  await client.downloadArtifact(reportArtifact.id, { path: downloadDir });
  await client.downloadArtifact(metadataArtifact.id, { path: downloadDir });

  const report = JSON.parse(
    await readFile(join(downloadDir, "lockray-report.json"), "utf8"),
  ) as CliReport;
  const metadata = JSON.parse(
    await readFile(join(downloadDir, "lockray-metadata.json"), "utf8"),
  ) as { prNumber: number; runId: number; headSha: string; failOnRisk: boolean };

  await runReportJob(
    {
      owner,
      repo,
      prNumber: metadata.prNumber,
      headSha: metadata.headSha,
      failOnRisk: metadata.failOnRisk,
      report,
    },
    { octokit },
  );
  return 0;
}

async function main(): Promise<void> {
  try {
    const inputs = readInputs();
    const exitCode = inputs.mode === "analyze" ? await runAnalyzeMode(inputs) : await runReportMode(inputs);
    if (exitCode !== 0) process.exit(exitCode);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

void main();
