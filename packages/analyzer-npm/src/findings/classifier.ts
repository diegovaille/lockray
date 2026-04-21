import type {
  DependencyChange,
  Evidence,
  FetchedPackage,
  Finding,
  Severity,
} from "@lockray/types";
import { extractInstallScripts, type InstallHook } from "../install-scripts/extract.js";
import { matchMaliciousPatterns } from "../install-scripts/malicious-patterns.js";
import {
  isMaliciousPackageAdvisory,
  normalizeOsvSeverity,
  type OsvVulnerability,
} from "../cve/types.js";
import { FindingCode } from "./codes.js";

const OSV_SEVERITY_TO_LOCKRAY: Record<string, Severity> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  unknown: "info",
};

/**
 * Classify a single DependencyChange into M2 finding set.
 *
 * Inputs:
 *   change        — DependencyChange from resolveChanges (M1).
 *   before        — FetchedPackage for change.fromVersion, or null if added.
 *   after         — FetchedPackage for change.toVersion, or null if removed.
 *   vulns         — OSV vulns for (ecosystem, name, change.toVersion), empty if none.
 */
export function classify(
  change: DependencyChange,
  before: FetchedPackage | null,
  after: FetchedPackage | null,
  vulns: readonly OsvVulnerability[],
): Finding[] {
  const findings: Finding[] = [];
  const version = change.toVersion ?? change.fromVersion ?? "";

  function baseEvidence(extra: Partial<Evidence>): Evidence {
    return { kind: "metadata", ...extra };
  }

  function emit(
    code: string,
    title: string,
    severity: Severity,
    confidence: number,
    evidence: Evidence[],
    hardFail: boolean,
  ): void {
    findings.push({
      code,
      title,
      severity,
      confidence,
      evidence,
      ecosystem: change.ecosystem,
      packageName: change.name,
      packageVersion: version,
      direct: change.direct,
      escalated: false,
      ...(hardFail ? { hardFail: true } : {}),
    });
  }

  // INTEGRITY_MISMATCH: hard-fail.
  if (change.integrityChanged) {
    emit(
      FindingCode.INTEGRITY_MISMATCH,
      `Integrity hash changed for ${change.name}@${version} without version change`,
      "critical",
      1.0,
      [
        baseEvidence({
          kind: "metadata",
          metadataField: "integrity",
          oldValue: before?.integrity ?? null as unknown as string,
          newValue: after?.integrity ?? null as unknown as string,
          remediationHint: "Investigate whether the package was re-published with the same version.",
        }),
      ],
      true,
    );
  }

  // NEW_DEPENDENCY_SOURCE: hard-fail.
  if (change.sourceChanged) {
    emit(
      FindingCode.NEW_DEPENDENCY_SOURCE,
      `${change.name}@${version} resolved to a new registry/URL`,
      "critical",
      1.0,
      [
        baseEvidence({
          kind: "registry",
          remediationHint: "Confirm the new resolved source is expected and trusted.",
        }),
      ],
      true,
    );
  }

  // Install-script diff: only fires when we have an `after` to inspect.
  if (after) {
    const newScripts = extractInstallScripts(after.packageJson);
    const oldScripts = before ? extractInstallScripts(before.packageJson) : {};

    for (const hook of ["preinstall", "install", "postinstall", "prepare"] as InstallHook[]) {
      const now = newScripts[hook];
      const was = oldScripts[hook];
      if (!now) continue;
      if (now === was) continue;

      // Check malicious patterns first — if any match, emit hard-fail and
      // skip the generic NEW_POSTINSTALL_SCRIPT so we don't double-count.
      const patterns = matchMaliciousPatterns(now);
      if (patterns.length > 0) {
        emit(
          FindingCode.MALICIOUS_INSTALL_SCRIPT,
          `Install hook ${hook} in ${change.name}@${version} matches a malicious pattern`,
          "critical",
          0.95,
          patterns.map((p) => ({
            kind: "heuristic" as const,
            metadataField: `scripts.${hook}`,
            newValue: now,
            oldValue: was,
            confidenceReason: `${p.id}: ${p.description}`,
            remediationHint: "Do not install; audit the upstream release before proceeding.",
          })),
          true,
        );
      } else {
        emit(
          FindingCode.NEW_POSTINSTALL_SCRIPT,
          `New or modified install hook ${hook} in ${change.name}@${version}`,
          "critical",
          0.9,
          [
            {
              kind: "metadata",
              metadataField: `scripts.${hook}`,
              oldValue: was,
              newValue: now,
              remediationHint: "Review the install script body before installing.",
            },
          ],
          false,
        );
      }
    }
  }

  // OSV findings.
  for (const v of vulns) {
    if (isMaliciousPackageAdvisory(v)) {
      emit(
        FindingCode.KNOWN_COMPROMISED_PACKAGE,
        `${change.name}@${version} is flagged as malicious by ${v.id}`,
        "critical",
        1.0,
        [
          {
            kind: "advisory",
            advisoryId: v.id,
            confidenceReason: v.summary ?? undefined,
            remediationHint: "Do not install; remove from the lockfile.",
          },
        ],
        true,
      );
      continue;
    }
    const level = normalizeOsvSeverity(v);
    const severity = OSV_SEVERITY_TO_LOCKRAY[level] ?? "info";
    emit(
      FindingCode.CVE_VULNERABILITY,
      `${v.id}: ${v.summary ?? "vulnerability"} affects ${change.name}@${version}`,
      severity,
      1.0,
      [
        {
          kind: "advisory",
          advisoryId: v.id,
          confidenceReason: v.summary ?? undefined,
        },
      ],
      false,
    );
  }

  return findings;
}
