import * as core from "@actions/core";
import * as github from "@actions/github";
import * as exec from "@actions/exec";
import * as artifact from "@actions/artifact";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runAnalyzeJob } from "./analyze.js";
import { runReportJob } from "./report.js";
function readInputs() {
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
const execFn = (cmd, args, opts) => exec.exec(cmd, args, opts);
const writeFn = async (path, content) => {
    await writeFile(path, content, "utf8");
};
function makeUploadClient() {
    const client = new artifact.DefaultArtifactClient();
    return {
        uploadArtifact: async (name, files, rootDirectory) => {
            const result = await client.uploadArtifact(name, files, rootDirectory);
            return { id: result.id ?? 0 };
        },
    };
}
async function runAnalyzeMode(inputs) {
    const ctx = github.context;
    const prNumberCandidate = ctx.payload.pull_request?.number ?? inputs.prNumber ?? null;
    if (prNumberCandidate === null) {
        throw new Error('analyze mode could not determine a PR number: not a pull_request event and no "pr-number" input provided');
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
async function runReportMode(inputs) {
    if (!inputs.githubToken)
        throw new Error("report mode requires github-token");
    if (!inputs.workflowRunId)
        throw new Error("report mode requires workflow-run-id");
    const client = new artifact.DefaultArtifactClient();
    const octokit = github.getOctokit(inputs.githubToken);
    // List artifacts for the triggering workflow_run, locate the report + metadata.
    const { owner, repo } = github.context.repo;
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
    const report = JSON.parse(await readFile(join(downloadDir, "lockray-report.json"), "utf8"));
    const metadata = JSON.parse(await readFile(join(downloadDir, "lockray-metadata.json"), "utf8"));
    await runReportJob({
        owner,
        repo,
        prNumber: metadata.prNumber,
        headSha: metadata.headSha,
        failOnRisk: metadata.failOnRisk,
        report,
    }, { octokit });
    return 0;
}
async function main() {
    try {
        const inputs = readInputs();
        const exitCode = inputs.mode === "analyze" ? await runAnalyzeMode(inputs) : await runReportMode(inputs);
        if (exitCode !== 0)
            process.exit(exitCode);
    }
    catch (err) {
        core.setFailed(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
void main();
//# sourceMappingURL=main.js.map