import { join } from "node:path";
/**
 * The Action invokes the `lockray` CLI binary directly. The binary must
 * resolve on PATH. In the dogfood workflow (Task 9) this is satisfied by
 * `npm link --workspace @lockray/cli`. External consumers must add an
 * install or link step before the analyze job, or wait for the M4
 * bundled-CLI variant that ships the CLI inside the Action bundle.
 *
 * To switch to on-demand npx resolution, update main.ts to pass "npx"
 * as the command with ["--yes", "@lockray/cli"] as the leading args.
 * The `deps` parameter is intended for test overrides, not runtime
 * consumer overrides.
 */
const DEFAULT_LOCKRAY_CMD = "lockray";
const DEFAULT_LOCKRAY_ARGS = [];
export async function runAnalyzeJob(inputs, deps) {
    const args = [
        ...DEFAULT_LOCKRAY_ARGS,
        "check",
        "--format",
        "json",
        "--base",
        inputs.base,
        "--head",
        inputs.head,
        "--cwd",
        inputs.workdir,
    ];
    let stdout = "";
    let stderr = "";
    const exitCode = await deps.exec(DEFAULT_LOCKRAY_CMD, args, {
        cwd: inputs.workdir,
        ignoreReturnCode: true,
        listeners: {
            stdout: (buf) => {
                stdout += buf.toString("utf8");
            },
            stderr: (buf) => {
                stderr += buf.toString("utf8");
            },
        },
    });
    let report;
    try {
        report = JSON.parse(stdout);
    }
    catch (err) {
        throw new Error(`could not parse lockray CLI JSON (exit ${exitCode}): ${err.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    const reportPath = join(inputs.workdir, "lockray-report.json");
    await deps.writeFile(reportPath, JSON.stringify(report, null, 2));
    await deps.uploadArtifact(inputs.artifactName, [reportPath], inputs.workdir);
    // Metadata blob so the report job can find the PR without re-parsing the event context.
    const metadataPath = join(inputs.workdir, "lockray-metadata.json");
    const metadata = {
        prNumber: deps.prNumber,
        runId: deps.runId,
        headSha: deps.headSha,
        failOnRisk: inputs.failOnRisk,
    };
    await deps.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    await deps.uploadArtifact(`${inputs.artifactName}-metadata`, [metadataPath], inputs.workdir);
    return { report, exitCode, stdout, stderr };
}
//# sourceMappingURL=analyze.js.map