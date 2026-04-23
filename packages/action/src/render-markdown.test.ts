import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./render-markdown.js";
import type { PrReport } from "@lockray/types";

function baseReport(overrides: Partial<PrReport> = {}): PrReport {
  return {
    base: "abc1234",
    head: "def5678",
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
    ...overrides,
  };
}

describe("renderMarkdown", () => {
  it("renders the no-findings verdict cleanly", () => {
    const md = renderMarkdown(baseReport());
    expect(md).toMatch(/no high-confidence risk signals found/i);
    expect(md).toMatch(/abc1234/);
    expect(md).toMatch(/def5678/);
    expect(md).not.toMatch(/BLOCKED/);
  });

  it("renders the blocked verdict with a clear header", () => {
    const finding = {
      code: "INTEGRITY_MISMATCH",
      title: "Integrity hash changed for left-pad@1.3.0 without version change",
      severity: "critical" as const,
      confidence: 1,
      evidence: [
        {
          kind: "metadata" as const,
          metadataField: "integrity",
          oldValue: "sha512-OLD",
          newValue: "sha512-NEW",
          remediationHint: "Investigate whether the package was re-published with the same version.",
        },
      ],
      ecosystem: "npm" as const,
      packageName: "left-pad",
      packageVersion: "1.3.0",
      direct: true,
      escalated: false,
      hardFail: true,
    };

    const md = renderMarkdown(
      baseReport({
        verdict: "block",
        prScore: 100,
        flaggedPackageCount: 1,
        blockCount: 1,
        hardFailCount: 1,
        topRisks: [
          {
            ecosystem: "npm",
            packageName: "left-pad",
            packageVersion: "1.3.0",
            direct: true,
            score: 100,
            verdict: "block",
            hardFail: true,
            findings: [finding],
          },
        ],
        packages: [
          {
            ecosystem: "npm",
            packageName: "left-pad",
            packageVersion: "1.3.0",
            direct: true,
            score: 100,
            verdict: "block",
            hardFail: true,
            findings: [finding],
          },
        ],
        workspaces: [
          {
            workspace: "root",
            ecosystem: "npm",
            parseOutcome: "fully-supported",
            changes: [
              {
                ecosystem: "npm",
                name: "left-pad",
                fromVersion: "1.3.0",
                toVersion: "1.3.0",
                direct: true,
                manifestPath: "package.json",
                workspaceName: "root",
                integrityChanged: true,
                sourceChanged: false,
              },
            ],
            findings: [finding],
          },
        ],
      }),
    );

    expect(md).toMatch(/### ❌ BLOCKED/);
    expect(md).toMatch(/INTEGRITY_MISMATCH/);
    expect(md).toMatch(/left-pad@1\.3\.0/);
    expect(md).toMatch(/sha512-OLD/);
    expect(md).toMatch(/sha512-NEW/);
    expect(md).toMatch(/Investigate whether the package was re-published/);
  });

  it("renders the review verdict when there are non-hard-fail findings", () => {
    const finding = {
      code: "NEW_POSTINSTALL_SCRIPT",
      title: "New or modified install hook postinstall in pkg@1.0.1",
      severity: "critical" as const,
      confidence: 0.9,
      evidence: [],
      ecosystem: "npm" as const,
      packageName: "pkg",
      packageVersion: "1.0.1",
      direct: true,
      escalated: false,
    };

    const md = renderMarkdown(
      baseReport({
        verdict: "review",
        prScore: 45,
        flaggedPackageCount: 1,
        reviewCount: 1,
        topRisks: [
          {
            ecosystem: "npm",
            packageName: "pkg",
            packageVersion: "1.0.1",
            direct: true,
            score: 45,
            verdict: "review",
            hardFail: false,
            findings: [finding],
          },
        ],
        packages: [
          {
            ecosystem: "npm",
            packageName: "pkg",
            packageVersion: "1.0.1",
            direct: true,
            score: 45,
            verdict: "review",
            hardFail: false,
            findings: [finding],
          },
        ],
        workspaces: [
          {
            workspace: "root",
            ecosystem: "npm",
            parseOutcome: "fully-supported",
            changes: [],
            findings: [finding],
          },
        ],
      }),
    );
    expect(md).toMatch(/### ⚠ Review findings/);
    expect(md).toMatch(/NEW_POSTINSTALL_SCRIPT/);
  });

  it("truncates the rendered body when many findings are present and adds a summary tail", () => {
    const findings = Array.from({ length: 40 }, (_, i) => ({
      code: "CVE_VULNERABILITY",
      title: `CVE ${i}`,
      severity: "high" as const,
      confidence: 0.95,
      evidence: [],
      ecosystem: "npm" as const,
      packageName: "pkg",
      packageVersion: `1.0.${i}`,
      direct: true,
      escalated: false,
    }));

    const many: PrReport = baseReport({
      verdict: "block",
      prScore: 100,
      flaggedPackageCount: 40,
      blockCount: 40,
      topRisks: [],
      packages: [],
      workspaces: [
        {
          workspace: "root",
          ecosystem: "npm",
          parseOutcome: "fully-supported",
          changes: [],
          findings,
        },
      ],
    });
    const md = renderMarkdown(many, { maxFindings: 10 });
    // Only the first 10 findings are printed explicitly.
    expect(md).toMatch(/CVE 0/);
    expect(md).toMatch(/CVE 9/);
    expect(md).not.toMatch(/CVE 30/);
    // The truncation notice announces the omitted count.
    expect(md).toMatch(/30 more findings omitted/);
  });

  it("renders registry-kind evidence with before/after URLs", () => {
    const finding = {
      code: "NEW_DEPENDENCY_SOURCE",
      title: "pkg@1.0.0 resolved to a new registry/URL",
      severity: "critical" as const,
      confidence: 1,
      evidence: [
        {
          kind: "registry" as const,
          registryUrl: "https://evil-mirror.example/pkg/-/pkg-1.0.0.tgz",
          oldValue: "https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz",
          newValue: "https://evil-mirror.example/pkg/-/pkg-1.0.0.tgz",
          remediationHint: "Confirm the new resolved source is expected and trusted.",
        },
      ],
      ecosystem: "npm" as const,
      packageName: "pkg",
      packageVersion: "1.0.0",
      direct: true,
      escalated: false,
      hardFail: true,
    };

    const md = renderMarkdown(
      baseReport({
        verdict: "block",
        prScore: 100,
        flaggedPackageCount: 1,
        blockCount: 1,
        hardFailCount: 1,
        topRisks: [
          {
            ecosystem: "npm",
            packageName: "pkg",
            packageVersion: "1.0.0",
            direct: true,
            score: 100,
            verdict: "block",
            hardFail: true,
            findings: [finding],
          },
        ],
        packages: [
          {
            ecosystem: "npm",
            packageName: "pkg",
            packageVersion: "1.0.0",
            direct: true,
            score: 100,
            verdict: "block",
            hardFail: true,
            findings: [finding],
          },
        ],
        workspaces: [
          {
            workspace: "root",
            ecosystem: "npm",
            parseOutcome: "fully-supported",
            changes: [],
            findings: [finding],
          },
        ],
      }),
    );
    expect(md).toMatch(/NEW_DEPENDENCY_SOURCE/);
    expect(md).toMatch(/resolved source/);
    expect(md).toMatch(/registry\.npmjs\.org/);
    expect(md).toMatch(/evil-mirror\.example/);
    expect(md).toMatch(/Confirm the new resolved source/);
  });

  it("renders advisory-kind evidence with advisory id and reason", () => {
    const finding = {
      code: "CVE_VULNERABILITY",
      title: "GHSA-xxxx-yyyy: prototype pollution affects pkg@1.0.0",
      severity: "high" as const,
      confidence: 0.95,
      evidence: [
        {
          kind: "advisory" as const,
          advisoryId: "GHSA-xxxx-yyyy",
          confidenceReason: "prototype pollution in merge()",
        },
      ],
      ecosystem: "npm" as const,
      packageName: "pkg",
      packageVersion: "1.0.0",
      direct: true,
      escalated: false,
    };

    const md = renderMarkdown(
      baseReport({
        workspaces: [
          {
            workspace: "root",
            ecosystem: "npm",
            parseOutcome: "fully-supported",
            changes: [],
            findings: [finding],
          },
        ],
        packages: [
          {
            ecosystem: "npm",
            packageName: "pkg",
            packageVersion: "1.0.0",
            direct: true,
            score: 45,
            verdict: "review",
            hardFail: false,
            findings: [finding],
          },
        ],
        topRisks: [],
      }),
    );
    expect(md).toMatch(/CVE_VULNERABILITY/);
    expect(md).toMatch(/GHSA-xxxx-yyyy/);
    expect(md).toMatch(/prototype pollution in merge/);
  });
});
