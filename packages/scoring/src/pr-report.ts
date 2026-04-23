import type { CliWorkspaceReport, PackageReport, PrReport, Verdict } from "@lockray/types";
import { DEFAULT_THRESHOLDS } from "./weights.js";

function verdictFor(score: number): Verdict {
  if (score >= DEFAULT_THRESHOLDS.block) return "block";
  if (score >= DEFAULT_THRESHOLDS.review) return "review";
  return "safe";
}

export interface PrReportInput {
  base: string;
  head: string;
  packages: readonly PackageReport[];
  workspaces: readonly CliWorkspaceReport[];
  /** Denominator for riskDensity. Use lockfile-level changed-package count. */
  totalChangedPackages: number;
}

/**
 * Aggregate per-package reports into a PR-level report. prScore is
 * max(package.score) so one rotten dep fails the PR. Counts are
 * derived; riskDensity normalises against totalChangedPackages.
 */
export function buildPrReport(input: PrReportInput): PrReport {
  const packages = input.packages;
  const prScore = packages.reduce((max, p) => (p.score > max ? p.score : max), 0);
  const verdict = verdictFor(prScore);

  const flaggedPackageCount = packages.filter((p) => p.verdict !== "safe").length;
  const reviewCount = packages.filter((p) => p.verdict === "review").length;
  const blockCount = packages.filter((p) => p.verdict === "block").length;
  const hardFailCount = packages.filter((p) => p.hardFail === true).length;

  const denom = Math.max(1, input.totalChangedPackages);
  const riskDensityRaw = flaggedPackageCount / denom;
  const riskDensity = Math.round(riskDensityRaw * 100) / 100;

  const topRisks = [...packages]
    .filter((p) => p.verdict !== "safe")
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    base: input.base,
    head: input.head,
    prScore,
    verdict,
    flaggedPackageCount,
    reviewCount,
    blockCount,
    hardFailCount,
    riskDensity,
    topRisks,
    packages: [...packages],
    workspaces: [...input.workspaces],
  };
}
