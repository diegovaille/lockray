import type { PrReport } from "@lockray/types";
import { renderMarkdown } from "./render-markdown.js";

const COMMENT_MARKER = "<!-- lockray:report -->";
const CHECK_NAME = "lockray/risk";

export interface ReportJobParams {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  failOnRisk: boolean;
  report: PrReport;
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
        conclusion: "success" | "failure";
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
  // TODO(M4): paginate past 100 comments via octokit.paginate() or a manual page
  // loop. PRs with more than 100 comments risk the existing LockRay comment
  // being missed here, which would produce a duplicate comment on the next run.
  const existing = await deps.octokit.rest.issues.listComments({
    owner: params.owner,
    repo: params.repo,
    issue_number: params.prNumber,
    per_page: 100,
  });
  const existingLockray = existing.data.find(
    (c) => typeof c.body === "string" && c.body.startsWith(COMMENT_MARKER),
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
  const shouldBlock = params.report.verdict === "block" && params.failOnRisk;
  const conclusion: "success" | "failure" = shouldBlock ? "failure" : "success";
  const title =
    params.report.verdict === "block"
      ? `LockRay blocked: score ${params.report.prScore}/100`
      : params.report.verdict === "review"
      ? `LockRay: ${params.report.flaggedPackageCount} flagged package(s) to review (score ${params.report.prScore}/100)`
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
