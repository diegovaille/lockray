import { describe, it, expect, vi } from "vitest";
import { runReportJob } from "./report.js";
import type { OctokitLike } from "./report.js";
import type { CliReport } from "@lockray/types";

function stubReport(blocked: boolean): CliReport {
  return {
    base: "aaa",
    head: "bbb",
    workspaces: [
      {
        workspace: "root",
        ecosystem: "npm",
        parseOutcome: "fully-supported",
        changes: [],
        findings: [],
      },
    ],
    changes: [],
    findings: [],
    blocked,
  };
}

interface OctokitStub {
  rest: {
    issues: {
      listComments: ReturnType<typeof vi.fn>;
      createComment: ReturnType<typeof vi.fn>;
      updateComment: ReturnType<typeof vi.fn>;
    };
    checks: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}

function newOctokit(existingComment: { id: number; body: string } | null = null): OctokitStub {
  const listComments = vi.fn(async () => ({ data: existingComment ? [existingComment] : [] }));
  const createComment = vi.fn(async () => ({ data: { id: 1 } }));
  const updateComment = vi.fn(async () => ({ data: { id: existingComment?.id ?? 0 } }));
  const checkCreate = vi.fn(async () => ({ data: { id: 1 } }));
  return {
    rest: {
      issues: { listComments, createComment, updateComment },
      checks: { create: checkCreate },
    },
  };
}

describe("runReportJob", () => {
  it("posts a new PR comment and a successful status check when report is clean", async () => {
    const octokit = newOctokit(null);
    await runReportJob(
      {
        owner: "acme",
        repo: "widget",
        prNumber: 7,
        headSha: "deadbeef",
        failOnRisk: true,
        report: stubReport(false),
      },
      { octokit: octokit as unknown as OctokitLike },
    );
    expect(octokit.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    const checkCall = octokit.rest.checks.create.mock.calls[0][0] as { conclusion: string; name: string };
    expect(checkCall.name).toBe("lockray/risk");
    expect(checkCall.conclusion).toBe("success");
  });

  it("updates the existing LockRay comment in place instead of creating a duplicate", async () => {
    const octokit = newOctokit({ id: 555, body: "<!-- lockray:report -->\nold body\n" });
    await runReportJob(
      {
        owner: "acme",
        repo: "widget",
        prNumber: 7,
        headSha: "deadbeef",
        failOnRisk: true,
        report: stubReport(false),
      },
      { octokit: octokit as unknown as OctokitLike },
    );
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 555 }),
    );
  });

  it("sets the status check to failure when blocked and failOnRisk is true", async () => {
    const octokit = newOctokit(null);
    await runReportJob(
      {
        owner: "acme",
        repo: "widget",
        prNumber: 7,
        headSha: "deadbeef",
        failOnRisk: true,
        report: stubReport(true),
      },
      { octokit: octokit as unknown as OctokitLike },
    );
    const checkCall = octokit.rest.checks.create.mock.calls[0][0] as { conclusion: string };
    expect(checkCall.conclusion).toBe("failure");
  });

  it("sets title to 'N finding(s) to review' when there are non-blocking findings", async () => {
    const octokit = newOctokit(null);
    const report = stubReport(false);
    report.workspaces[0].findings.push({
      code: "NEW_POSTINSTALL_SCRIPT",
      title: "New install hook postinstall in pkg@1.0.1",
      severity: "critical",
      confidence: 0.9,
      evidence: [],
      ecosystem: "npm",
      packageName: "pkg",
      packageVersion: "1.0.1",
      direct: true,
      escalated: false,
    });
    await runReportJob(
      {
        owner: "acme",
        repo: "widget",
        prNumber: 7,
        headSha: "deadbeef",
        failOnRisk: true,
        report,
      },
      { octokit: octokit as unknown as OctokitLike },
    );
    const checkCall = octokit.rest.checks.create.mock.calls[0][0] as { conclusion: string; output: { title: string } };
    expect(checkCall.conclusion).toBe("success");
    expect(checkCall.output.title).toMatch(/1 finding\(s\) to review/);
  });

  it("status check is success when blocked but fail-on-risk is false", async () => {
    const octokit = newOctokit(null);
    await runReportJob(
      {
        owner: "acme",
        repo: "widget",
        prNumber: 7,
        headSha: "deadbeef",
        failOnRisk: false,
        report: stubReport(true),
      },
      { octokit: octokit as unknown as OctokitLike },
    );
    const checkCall = octokit.rest.checks.create.mock.calls[0][0] as { conclusion: string; output: { title: string } };
    expect(checkCall.conclusion).toBe("success");
    expect(checkCall.output.title).toMatch(/hard-fail rule fired/);
  });
});
