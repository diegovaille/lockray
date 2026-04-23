import { describe, it, expect } from "vitest";
import type { CliWorkspaceReport, PackageReport } from "@lockray/types";
import { buildPrReport } from "./pr-report.js";

function pkg(overrides: Partial<PackageReport> = {}): PackageReport {
  return {
    ecosystem: "npm",
    packageName: "pkg",
    packageVersion: "1.0.0",
    direct: true,
    score: 0,
    verdict: "safe",
    hardFail: false,
    findings: [],
    ...overrides,
  };
}

const BASE = "aaa";
const HEAD = "bbb";
const NO_WORKSPACES: CliWorkspaceReport[] = [];

describe("buildPrReport", () => {
  it("returns verdict=safe + prScore=0 when no packages", () => {
    const r = buildPrReport({ base: BASE, head: HEAD, packages: [], workspaces: NO_WORKSPACES, totalChangedPackages: 0 });
    expect(r.prScore).toBe(0);
    expect(r.verdict).toBe("safe");
    expect(r.flaggedPackageCount).toBe(0);
    expect(r.riskDensity).toBe(0);
    expect(r.topRisks).toEqual([]);
  });

  it("uses max(package.score) for prScore and picks verdict accordingly", () => {
    const pkgs = [
      pkg({ score: 20, verdict: "safe" }),
      pkg({ score: 55, verdict: "review", packageName: "a" }),
      pkg({ score: 80, verdict: "block", packageName: "b", hardFail: true }),
    ];
    const r = buildPrReport({ base: BASE, head: HEAD, packages: pkgs, workspaces: NO_WORKSPACES, totalChangedPackages: 3 });
    expect(r.prScore).toBe(80);
    expect(r.verdict).toBe("block");
  });

  it("counts flagged, review, block, hard-fail correctly", () => {
    const pkgs = [
      pkg({ score: 10, verdict: "safe" }),
      pkg({ score: 35, verdict: "review", packageName: "r1" }),
      pkg({ score: 45, verdict: "review", packageName: "r2" }),
      pkg({ score: 100, verdict: "block", packageName: "b1", hardFail: true }),
    ];
    const r = buildPrReport({ base: BASE, head: HEAD, packages: pkgs, workspaces: NO_WORKSPACES, totalChangedPackages: 4 });
    expect(r.flaggedPackageCount).toBe(3);
    expect(r.reviewCount).toBe(2);
    expect(r.blockCount).toBe(1);
    expect(r.hardFailCount).toBe(1);
  });

  it("computes riskDensity as flagged / totalChangedPackages (rounded to 2 decimals)", () => {
    const pkgs = [pkg({ score: 40, verdict: "review", packageName: "r" })];
    const r = buildPrReport({ base: BASE, head: HEAD, packages: pkgs, workspaces: NO_WORKSPACES, totalChangedPackages: 10 });
    expect(r.riskDensity).toBe(0.1);
  });

  it("topRisks is the top 3 packages by score descending, limited to flagged", () => {
    const pkgs = [
      pkg({ packageName: "a", score: 10, verdict: "safe" }),
      pkg({ packageName: "b", score: 70, verdict: "block" }),
      pkg({ packageName: "c", score: 40, verdict: "review" }),
      pkg({ packageName: "d", score: 50, verdict: "review" }),
      pkg({ packageName: "e", score: 35, verdict: "review" }),
    ];
    const r = buildPrReport({ base: BASE, head: HEAD, packages: pkgs, workspaces: NO_WORKSPACES, totalChangedPackages: 5 });
    expect(r.topRisks.map((p) => p.packageName)).toEqual(["b", "d", "c"]);
  });
});
