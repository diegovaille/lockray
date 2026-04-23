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

  // lockray-metadata.json is diagnostic-only. The privileged report job
  // MUST NOT use its contents to decide which PR to comment on, which
  // commit to status-check, or whether to block — those identities and
  // policies are derived by the report job from the trusted workflow_run
  // event payload and its own action input. Metadata is retained as an
  // audit trail and for consistency warnings only.
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
