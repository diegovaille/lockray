import type { CliReport } from "@lockray/types";
import { renderMarkdown } from "./render-markdown.js";

const COMMENT_MARKER = "<!-- lockray:report -->";
const CHECK_NAME = "lockray/risk";

export interface ReportJobParams {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  failOnRisk: boolean;
  report: CliReport;
}

/**
 * Minimal subset of the Octokit shape we need. Defined here (not
 * imported from @octokit/rest) so tests can stub without pulling the
 * full typings.
 */
export interface OctokitLike {
  rest: {
    issues: {
      listComments: (args: {
        owner: string;
        repo: string;
        issue_number: number;
        per_page?: number;
      }) => Promise<{ data: ReadonlyArray<{ id: number; body?: string }> }>;
      createComment: (args: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }) => Promise<{ data: { id: number } }>;
      updateComment: (args: {
        owner: string;
        repo: string;
        comment_id: number;
        body: string;
      }) => Promise<{ data: { id: number } }>;
    };
    checks: {
      create: (args: {
        owner: string;
        repo: string;
        name: string;
        head_sha: string;
        status: "completed";
        conclusion: "success" | "failure" | "neutral";
        output?: { title: string; summary: string };
      }) => Promise<{ data: { id: number } }>;
    };
  };
}

export interface ReportJobDeps {
  octokit: OctokitLike;
}

export async function runReportJob(
  params: ReportJobParams,
  deps: ReportJobDeps,
): Promise<void> {
  const body = `${COMMENT_MARKER}\n${renderMarkdown(params.report)}`;

  // Upsert the PR comment.
  const existing = await deps.octokit.rest.issues.listComments({
    owner: params.owner,
    repo: params.repo,
    issue_number: params.prNumber,
    per_page: 100,
  });
  const existingLockray = existing.data.find(
    (c) => typeof c.body === "string" && c.body.includes(COMMENT_MARKER),
  );
  if (existingLockray) {
    await deps.octokit.rest.issues.updateComment({
      owner: params.owner,
      repo: params.repo,
      comment_id: existingLockray.id,
      body,
    });
  } else {
    await deps.octokit.rest.issues.createComment({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.prNumber,
      body,
    });
  }

  // Status check.
  const conclusion: "success" | "failure" =
    params.report.blocked && params.failOnRisk ? "failure" : "success";
  const totalFindings = params.report.workspaces.reduce((n, w) => n + w.findings.length, 0);
  const title = params.report.blocked
    ? "LockRay blocked: hard-fail rule fired"
    : totalFindings > 0
      ? `LockRay: ${totalFindings} finding(s) to review`
      : "LockRay: no risk signals found";

  await deps.octokit.rest.checks.create({
    owner: params.owner,
    repo: params.repo,
    name: CHECK_NAME,
    head_sha: params.headSha,
    status: "completed",
    conclusion,
    output: { title, summary: title },
  });
}
