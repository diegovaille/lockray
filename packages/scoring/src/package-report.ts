import type { Ecosystem, Finding, PackageReport, Verdict } from "@lockray/types";
import { DEFAULT_THRESHOLDS } from "./weights.js";
import { contributionFor } from "./contribution.js";
import { compoundBonusFor } from "./compound.js";

export interface PackageKey {
  ecosystem: Ecosystem;
  packageName: string;
  packageVersion: string;
  direct: boolean;
}

function verdictFor(score: number): Verdict {
  if (score >= DEFAULT_THRESHOLDS.block) return "block";
  if (score >= DEFAULT_THRESHOLDS.review) return "review";
  return "safe";
}

/**
 * Fold a package's findings into a PackageReport. Applies per-finding
 * contribution math, per-code diminishing returns, compound bonuses,
 * hard-fail override, and verdict-threshold selection.
 */
export function buildPackageReport(
  key: PackageKey,
  findings: readonly Finding[],
): PackageReport {
  const anyHardFail = findings.some((f) => f.hardFail === true);

  if (anyHardFail) {
    return {
      ecosystem: key.ecosystem,
      packageName: key.packageName,
      packageVersion: key.packageVersion,
      direct: key.direct,
      score: 100,
      verdict: "block",
      hardFail: true,
      findings: [...findings],
    };
  }

  // Group by code so diminishing returns apply per-code within the package.
  const occurrencesByCode = new Map<string, number>();
  let raw = 0;
  for (const f of findings) {
    const idx = occurrencesByCode.get(f.code) ?? 0;
    raw += contributionFor(f, idx);
    occurrencesByCode.set(f.code, idx + 1);
  }
  raw += compoundBonusFor(findings);
  const score = Math.min(100, Math.round(raw));

  return {
    ecosystem: key.ecosystem,
    packageName: key.packageName,
    packageVersion: key.packageVersion,
    direct: key.direct,
    score,
    verdict: verdictFor(score),
    hardFail: false,
    findings: [...findings],
  };
}
