import { describe, it, expect, vi } from "vitest";
import { runReportJob } from "./report.js";
import type { OctokitLike } from "./report.js";
import type { PrReport, Verdict } from "@lockray/types";

function stubReport(verdict: Verdict, prScore = 0, overrides: Partial<PrReport> = {}): PrReport {
  return {
    base: "aaa",
    head: "bbb",
    prScore,
    verdict,
    flaggedPackageCount: verdict === "safe" ? 0 : 1,
    reviewCount: verdict === "review" ? 1 : 0,
    blockCount: verdict === "block" ? 1 : 0,
    hardFailCount: 0,
    riskDensity: 0,
    topRisks: [],
    packages: [],
    workspaces: [
      {
        workspace: "root",
        ecosystem: "npm",
        parseOutcome: "fully-supported",
        changes: [],
        findings: [],
      },
    ],
    ...overrides,
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
        report: stubReport("safe", 0),
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
        report: stubReport("safe", 0),
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
        report: stubReport("block", 100),
      },
      { octokit: octokit as unknown as OctokitLike },
    );
    const checkCall = octokit.rest.checks.create.mock.calls[0][0] as { conclusion: string };
    expect(checkCall.conclusion).toBe("failure");
  });

  it("sets title with flagged count and score for review verdict", async () => {
    const octokit = newOctokit(null);
    await runReportJob(
      {
        owner: "acme",
        repo: "widget",
        prNumber: 7,
        headSha: "deadbeef",
        failOnRisk: true,
        report: stubReport("review", 45, { flaggedPackageCount: 1 }),
      },
      { octokit: octokit as unknown as OctokitLike },
    );
    const checkCall = octokit.rest.checks.create.mock.calls[0][0] as { conclusion: string; output: { title: string } };
    expect(checkCall.conclusion).toBe("success");
    expect(checkCall.output.title).toMatch(/1 flagged package.+score 45/);
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
        report: stubReport("block", 100),
      },
      { octokit: octokit as unknown as OctokitLike },
    );
    const checkCall = octokit.rest.checks.create.mock.calls[0][0] as { conclusion: string; output: { title: string } };
    expect(checkCall.conclusion).toBe("success");
    expect(checkCall.output.title).toMatch(/LockRay blocked: score 100/);
  });
});
