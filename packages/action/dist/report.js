import { renderMarkdown } from "./render-markdown.js";
const COMMENT_MARKER = "<!-- lockray:report -->";
const CHECK_NAME = "lockray/risk";
export async function runReportJob(params, deps) {
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
    const existingLockray = existing.data.find((c) => typeof c.body === "string" && c.body.startsWith(COMMENT_MARKER));
    if (existingLockray) {
        await deps.octokit.rest.issues.updateComment({
            owner: params.owner,
            repo: params.repo,
            comment_id: existingLockray.id,
            body,
        });
    }
    else {
        await deps.octokit.rest.issues.createComment({
            owner: params.owner,
            repo: params.repo,
            issue_number: params.prNumber,
            body,
        });
    }
    // Status check.
    const conclusion = params.report.blocked && params.failOnRisk ? "failure" : "success";
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
//# sourceMappingURL=report.js.map