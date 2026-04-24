import { describe, it, expect, vi } from "vitest";
import type { ActionInputs } from "./types.js";
import { runAnalyzeJob } from "./analyze.js";
import type { PrReport } from "@lockray/types";

function baseReport(): PrReport {
  return {
    base: "aaa",
    head: "bbb",
    prScore: 0,
    verdict: "safe",
    flaggedPackageCount: 0,
    reviewCount: 0,
    blockCount: 0,
    hardFailCount: 0,
    riskDensity: 0,
    topRisks: [],
    packages: [],
    workspaces: [],
  };
}

function stubInputs(over: Partial<ActionInputs> = {}): ActionInputs {
  return {
    mode: "analyze",
    workdir: "/tmp/lockray-analyze",
    base: "origin/main",
    head: "HEAD",
    failOnRisk: true,
    artifactName: "lockray-report",
    workflowRunId: null,
    prNumber: null,
    githubToken: "",
    ...over,
  };
}

describe("runAnalyzeJob", () => {
  it("invokes the CLI and returns the parsed report", async () => {
    const fakeExec = vi.fn(async (_cmd: string, _args: string[], opts?: { listeners?: { stdout?: (buf: Buffer) => void } }) => {
      const json = JSON.stringify(baseReport());
      opts?.listeners?.stdout?.(Buffer.from(json, "utf8"));
      return 0;
    });
    const fakeUploader = vi.fn(async () => ({ id: 1 }));
    const fakeWriter = vi.fn(async () => {});

    const result = await runAnalyzeJob(stubInputs(), {
      exec: fakeExec,
      writeFile: fakeWriter,
      uploadArtifact: fakeUploader,
      prNumber: 42,
      runId: 99,
      headSha: "cafebabe",
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.verdict).toBe("safe");
    expect(fakeExec).toHaveBeenCalledWith(
      expect.stringContaining("lockray"),
      expect.arrayContaining(["check", "--format", "json", "--base", "origin/main", "--head", "HEAD"]),
      expect.anything(),
    );
    expect(fakeUploader).toHaveBeenCalledTimes(2); // report + metadata
    expect(fakeWriter).toHaveBeenCalled();
  });

  it("propagates a non-zero exit code as blocked without throwing", async () => {
    const blockedReport: PrReport = { ...baseReport(), verdict: "block", prScore: 100, blockCount: 1, flaggedPackageCount: 1 };
    const fakeExec = vi.fn(async (_cmd: string, _args: string[], opts?: { listeners?: { stdout?: (buf: Buffer) => void } }) => {
      opts?.listeners?.stdout?.(Buffer.from(JSON.stringify(blockedReport), "utf8"));
      return 1;
    });

    const result = await runAnalyzeJob(stubInputs({ failOnRisk: true }), {
      exec: fakeExec,
      writeFile: vi.fn(async () => {}),
      uploadArtifact: vi.fn(async () => ({ id: 1 })),
      prNumber: 1,
      runId: 2,
      headSha: "deadbeef",
    });

    expect(result.exitCode).toBe(1);
    expect(result.report.verdict).toBe("block");
  });

  it("throws a descriptive error when the CLI stdout is not valid JSON", async () => {
    const fakeExec = vi.fn(async (_cmd: string, _args: string[], opts?: { listeners?: { stdout?: (buf: Buffer) => void } }) => {
      opts?.listeners?.stdout?.(Buffer.from("not-json", "utf8"));
      return 0;
    });

    await expect(
      runAnalyzeJob(stubInputs(), {
        exec: fakeExec,
        writeFile: vi.fn(async () => {}),
        uploadArtifact: vi.fn(async () => ({ id: 1 })),
        prNumber: 1,
        runId: 2,
        headSha: "deadbeef",
      }),
    ).rejects.toThrow(/could not parse lockray CLI JSON/i);
  });
});
