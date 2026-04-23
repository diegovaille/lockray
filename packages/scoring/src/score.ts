import type { CliWorkspaceReport, Finding, PackageReport, PrReport } from "@lockray/types";
import { buildPackageReport } from "./package-report.js";
import { buildPrReport } from "./pr-report.js";

export interface ScoreInput {
  base: string;
  head: string;
  findings: readonly Finding[];
  workspaces: readonly CliWorkspaceReport[];
  totalChangedPackages: number;
}

function keyOf(f: Finding): string {
  return `${f.ecosystem}|${f.packageName}|${f.packageVersion}`;
}

/**
 * Compose the scoring pipeline: group findings by
 * (ecosystem, packageName, packageVersion), aggregate each group via
 * buildPackageReport, then aggregate the resulting PackageReports via
 * buildPrReport. Returns the PR-level authoritative PrReport.
 */
export function score(input: ScoreInput): PrReport {
  const groups = new Map<string, Finding[]>();
  for (const f of input.findings) {
    const k = keyOf(f);
    const bucket = groups.get(k);
    if (bucket) {
      bucket.push(f);
    } else {
      groups.set(k, [f]);
    }
  }

  const packages: PackageReport[] = [];
  for (const bucket of groups.values()) {
    const first = bucket[0]!;
    packages.push(
      buildPackageReport(
        {
          ecosystem: first.ecosystem,
          packageName: first.packageName,
          packageVersion: first.packageVersion,
          direct: first.direct,
        },
        bucket,
      ),
    );
  }

  return buildPrReport({
    base: input.base,
    head: input.head,
    packages,
    workspaces: input.workspaces,
    totalChangedPackages: input.totalChangedPackages,
  });
}
