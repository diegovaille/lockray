import * as core from "@actions/core";
import * as github from "@actions/github";
import * as exec from "@actions/exec";
import * as artifact from "@actions/artifact";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrReport } from "@lockray/types";
import { runAnalyzeJob, type ExecFn, type UploadArtifactFn, type WriteFileFn } from "./analyze.js";
import { runReportJob } from "./report.js";
import type { ActionInputs } from "./types.js";

export interface TrustedReportIdentity {
  prNumber: number;
  headSha: string;
  failOnRisk: boolean;
}

/**
 * Derive the trusted report identity from the workflow_run event payload and
 * the report job's own action inputs. The payload is received directly from
 * GitHub by the privileged runner and cannot be tampered with by PR code.
 *
 * inputsPrNumber is used only as a fallback when workflow_run.pull_requests is
 * empty (e.g. a manually-triggered run); it is still a privileged caller-supplied
 * value, not artifact data. failOnRisk ALWAYS comes from the report job's own
 * action input — never from the analyze-job artifact.
 */
export function resolveTrustedReportIdentity(
  workflowRunPayload: unknown,
  inputsPrNumber: number | null,
  inputsFailOnRisk: boolean,
): TrustedReportIdentity {
  const p = workflowRunPayload as
    | { pull_requests?: Array<{ number: number }>; head_sha?: string }
    | undefined;
  const prNumber = p?.pull_requests?.[0]?.number ?? inputsPrNumber ?? null;
  const headSha = p?.head_sha ?? null;
  if (prNumber === null) {
    throw new Error(
      "report mode could not resolve a trusted PR number from workflow_run.pull_requests",
    );
  }
  if (headSha === null) {
    throw new Error(
      "report mode could not resolve trusted head_sha from workflow_run payload",
    );
  }
  return { prNumber, headSha, failOnRisk: inputsFailOnRisk };
}

export interface MetadataConsistencyWarning {
  field: "prNumber" | "headSha" | "failOnRisk";
  metadataValue: unknown;
  trustedValue: unknown;
}

/**
 * Compare analyze-job metadata against the trusted identity and return a list
 * of discrepancies. Used only for logging — callers must never use metadata
 * values to override the trusted identity.
 */
export function compareMetadataAgainstTrusted(
  metadata: { prNumber?: unknown; headSha?: unknown; failOnRisk?: unknown },
  trusted: TrustedReportIdentity,
): MetadataConsistencyWarning[] {
  const warnings: MetadataConsistencyWarning[] = [];
  if (metadata.prNumber !== undefined && metadata.prNumber !== trusted.prNumber) {
    warnings.push({ field: "prNumber", metadataValue: metadata.prNumber, trustedValue: trusted.prNumber });
  }
  if (metadata.headSha !== undefined && metadata.headSha !== trusted.headSha) {
    warnings.push({ field: "headSha", metadataValue: metadata.headSha, trustedValue: trusted.headSha });
  }
  if (metadata.failOnRisk !== undefined && metadata.failOnRisk !== trusted.failOnRisk) {
    warnings.push({ field: "failOnRisk", metadataValue: metadata.failOnRisk, trustedValue: trusted.failOnRisk });
  }
  return warnings;
}

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

function makeUploadClient(): { uploadArtifact: UploadArtifactFn } {
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
  const prNumberCandidate =
    ctx.payload.pull_request?.number ?? inputs.prNumber ?? null;
  if (prNumberCandidate === null) {
    throw new Error(
      'analyze mode could not determine a PR number: not a pull_request event and no "pr-number" input provided',
    );
  }
  const prNumber = prNumberCandidate;
  const headSha = ctx.payload.pull_request?.head?.sha ?? ctx.sha;
  const runId = ctx.runId;

  const { uploadArtifact } = makeUploadClient();
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

  const { owner, repo } = github.context.repo;

  // TRUSTED identity, derived from the workflow_run event payload the
  // privileged runner received directly from GitHub. We MUST NOT trust
  // prNumber/headSha from the uploaded metadata.json — that file is
  // produced by the unprivileged analyze job, which a PR can influence.
  const trustedIdentity = resolveTrustedReportIdentity(
    github.context.payload.workflow_run,
    inputs.prNumber,
    inputs.failOnRisk,
  );

  const client = new artifact.DefaultArtifactClient();
  const octokit = github.getOctokit(inputs.githubToken);

  // List artifacts for the triggering workflow_run, locate the report + metadata.
  // per_page: 100 is the GitHub API max. For monorepos that upload many
  // artifacts per run, this avoids losing the LockRay artifacts off page 1.
  // TODO(M4): paginate if any consumer routinely exceeds 100 artifacts/run.
  const runArtifacts = await octokit.rest.actions.listWorkflowRunArtifacts({
    owner,
    repo,
    run_id: inputs.workflowRunId,
    per_page: 100,
  });
  const reportArtifact = runArtifacts.data.artifacts.find((a) => a.name === inputs.artifactName);
  const metadataArtifact = runArtifacts.data.artifacts.find((a) => a.name === `${inputs.artifactName}-metadata`);
  if (!reportArtifact || !metadataArtifact) {
    throw new Error(`could not locate artifacts on run ${inputs.workflowRunId}`);
  }

  const downloadDir = process.env.RUNNER_TEMP ?? "/tmp";
  // downloadArtifact needs findBy when the target lives in a different
  // workflow run from the one currently executing (our report job runs on
  // workflow_run, which is a different run than the analyze job that
  // produced the artifacts). Without findBy, the client falls back to the
  // internal Twirp API scoped to the current run and fails to find the
  // cross-run artifact.
  const findBy = {
    token: inputs.githubToken,
    workflowRunId: inputs.workflowRunId,
    repositoryOwner: owner,
    repositoryName: repo,
  };
  // @actions/artifact v2 extracts single-file artifacts flat into `path`,
  // so readFile(join(downloadDir, "lockray-*.json")) below is correct.
  // If the library's extraction layout changes, these readFile paths will
  // need to pick up a subdirectory.
  await client.downloadArtifact(reportArtifact.id, { path: downloadDir, findBy });
  await client.downloadArtifact(metadataArtifact.id, { path: downloadDir, findBy });

  const report = JSON.parse(
    await readFile(join(downloadDir, "lockray-report.json"), "utf8"),
  ) as PrReport;

  // Metadata is still loaded for diagnostic purposes only. Its values
  // never reach runReportJob; they're only used to log a warning if they
  // diverge from the trusted values, so operators can notice a forgery attempt.
  try {
    const metadataRaw = await readFile(join(downloadDir, "lockray-metadata.json"), "utf8");
    const metadata = JSON.parse(metadataRaw) as {
      prNumber?: unknown;
      headSha?: unknown;
      failOnRisk?: unknown;
    };
    const discrepancies = compareMetadataAgainstTrusted(metadata, trustedIdentity);
    for (const w of discrepancies) {
      core.warning(
        `analyze-job metadata ${w.field} (${String(w.metadataValue)}) disagrees with trusted value (${String(w.trustedValue)}) — using trusted value`,
      );
    }
    if (discrepancies.length === 0) {
      core.info("metadata consistency check passed — analyze-job metadata matches trusted workflow_run payload");
    }
  } catch (err) {
    core.info(`metadata consistency check skipped: ${(err as Error).message}`);
  }

  await runReportJob(
    {
      owner,
      repo,
      prNumber: trustedIdentity.prNumber,
      headSha: trustedIdentity.headSha,
      failOnRisk: trustedIdentity.failOnRisk,
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

// Guard prevents main() from auto-executing when the module is imported by
// the test suite (vitest sets VITEST=true). In production the Action runner
// never sets VITEST, so the entry-point fires normally.
if (!process.env["VITEST"]) {
  void main();
}
