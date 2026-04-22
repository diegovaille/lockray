import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./render-markdown.js";
import type { CliReport } from "@lockray/types";

function baseReport(overrides: Partial<CliReport> = {}): CliReport {
  return {
    base: "abc1234",
    head: "def5678",
    workspaces: [],
    changes: [],
    findings: [],
    blocked: false,
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
    const md = renderMarkdown(
      baseReport({
        blocked: true,
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
            findings: [
              {
                code: "INTEGRITY_MISMATCH",
                title: "Integrity hash changed for left-pad@1.3.0 without version change",
                severity: "critical",
                confidence: 1,
                evidence: [
                  {
                    kind: "metadata",
                    metadataField: "integrity",
                    oldValue: "sha512-OLD",
                    newValue: "sha512-NEW",
                    remediationHint: "Investigate whether the package was re-published with the same version.",
                  },
                ],
                ecosystem: "npm",
                packageName: "left-pad",
                packageVersion: "1.3.0",
                direct: true,
                escalated: false,
                hardFail: true,
              },
            ],
          },
        ],
        changes: [],
        findings: [],
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
    const md = renderMarkdown(
      baseReport({
        blocked: false,
        workspaces: [
          {
            workspace: "root",
            ecosystem: "npm",
            parseOutcome: "fully-supported",
            changes: [],
            findings: [
              {
                code: "NEW_POSTINSTALL_SCRIPT",
                title: "New or modified install hook postinstall in pkg@1.0.1",
                severity: "critical",
                confidence: 0.9,
                evidence: [],
                ecosystem: "npm",
                packageName: "pkg",
                packageVersion: "1.0.1",
                direct: true,
                escalated: false,
              },
            ],
          },
        ],
      }),
    );
    expect(md).toMatch(/### ⚠ Review findings/);
    expect(md).toMatch(/NEW_POSTINSTALL_SCRIPT/);
  });

  it("truncates the rendered body when many findings are present and adds a summary tail", () => {
    const many: CliReport = baseReport({
      blocked: true,
      workspaces: [
        {
          workspace: "root",
          ecosystem: "npm",
          parseOutcome: "fully-supported",
          changes: [],
          findings: Array.from({ length: 40 }, (_, i) => ({
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
          })),
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
    const md = renderMarkdown(
      baseReport({
        blocked: true,
        workspaces: [
          {
            workspace: "root",
            ecosystem: "npm",
            parseOutcome: "fully-supported",
            changes: [],
            findings: [
              {
                code: "NEW_DEPENDENCY_SOURCE",
                title: "pkg@1.0.0 resolved to a new registry/URL",
                severity: "critical",
                confidence: 1,
                evidence: [
                  {
                    kind: "registry",
                    registryUrl: "https://evil-mirror.example/pkg/-/pkg-1.0.0.tgz",
                    oldValue: "https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz",
                    newValue: "https://evil-mirror.example/pkg/-/pkg-1.0.0.tgz",
                    remediationHint: "Confirm the new resolved source is expected and trusted.",
                  },
                ],
                ecosystem: "npm",
                packageName: "pkg",
                packageVersion: "1.0.0",
                direct: true,
                escalated: false,
                hardFail: true,
              },
            ],
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
    const md = renderMarkdown(
      baseReport({
        workspaces: [
          {
            workspace: "root",
            ecosystem: "npm",
            parseOutcome: "fully-supported",
            changes: [],
            findings: [
              {
                code: "CVE_VULNERABILITY",
                title: "GHSA-xxxx-yyyy: prototype pollution affects pkg@1.0.0",
                severity: "high",
                confidence: 0.95,
                evidence: [
                  {
                    kind: "advisory",
                    advisoryId: "GHSA-xxxx-yyyy",
                    confidenceReason: "prototype pollution in merge()",
                  },
                ],
                ecosystem: "npm",
                packageName: "pkg",
                packageVersion: "1.0.0",
                direct: true,
                escalated: false,
              },
            ],
          },
        ],
      }),
    );
    expect(md).toMatch(/CVE_VULNERABILITY/);
    expect(md).toMatch(/GHSA-xxxx-yyyy/);
    expect(md).toMatch(/prototype pollution in merge/);
  });
});
