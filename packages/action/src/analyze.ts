import { join } from "node:path";
import type { CliReport } from "@lockray/types";
import type { ActionInputs, AnalyzeResult } from "./types.js";

export type ExecFn = (
  cmd: string,
  args: string[],
  opts?: {
    cwd?: string;
    listeners?: {
      stdout?: (buf: Buffer) => void;
      stderr?: (buf: Buffer) => void;
    };
    ignoreReturnCode?: boolean;
  },
) => Promise<number>;

export type WriteFileFn = (path: string, content: string) => Promise<void>;

export type UploadArtifactFn = (
  artifactName: string,
  files: string[],
  rootDirectory: string,
) => Promise<{ id: number }>;

export interface AnalyzeDeps {
  exec: ExecFn;
  writeFile: WriteFileFn;
  uploadArtifact: UploadArtifactFn;
  prNumber: number;
  runId: number;
  headSha: string;
}

/**
 * The Action invokes the lockray CLI binary directly. The CLI must be on
 * PATH (e.g. via `npm link` in the dogfood workflow, or installed globally).
 * For on-demand resolution via npx, callers may override exec in deps.
 */
const DEFAULT_LOCKRAY_CMD = "lockray";
const DEFAULT_LOCKRAY_ARGS: string[] = [];

export async function runAnalyzeJob(
  inputs: ActionInputs,
  deps: AnalyzeDeps,
): Promise<AnalyzeResult> {
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

  let report: CliReport;
  try {
    report = JSON.parse(stdout) as CliReport;
  } catch (err) {
    throw new Error(
      `could not parse lockray CLI JSON (exit ${exitCode}): ${(err as Error).message}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
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
