/**
 * Action-local types. The shared `CliReport` shape lives in @lockray/types.
 */
import type { CliReport } from "@lockray/types";

export interface ActionInputs {
  /** "analyze" runs the CLI + uploads artifact. "report" downloads and posts comment + status. */
  mode: "analyze" | "report";
  /** CWD to run the CLI from; defaults to the workspace root. */
  workdir: string;
  /** Git base ref (analyze mode only). */
  base: string;
  /** Git head ref (analyze mode only). */
  head: string;
  /** Block the PR on hard-fails. */
  failOnRisk: boolean;
  /** Artifact name (must match between analyze and report). */
  artifactName: string;
  /** Report mode: the workflow_run that produced the artifact (required in report mode). */
  workflowRunId: number | null;
  /** Report mode: PR number to comment on. */
  prNumber: number | null;
  /** Report mode: octokit auth token. */
  githubToken: string;
}

export interface AnalyzeResult {
  report: CliReport;
  exitCode: number;
  stdout: string;
  stderr: string;
}
