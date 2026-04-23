import { describe, it, expect } from "vitest";
import type { CliWorkspaceReport, Finding } from "@lockray/types";
import { score } from "./score.js";

function fi(overrides: Partial<Finding> = {}): Finding {
  return {
    code: "CVE_VULNERABILITY",
    title: "t",
    severity: "medium",
    confidence: 1.0,
    evidence: [],
    ecosystem: "npm",
    packageName: "pkg",
    packageVersion: "1.0.0",
    direct: true,
    escalated: false,
    ...overrides,
  };
}

const NO_WORKSPACES: CliWorkspaceReport[] = [];

describe("score (end-to-end)", () => {
  it("returns verdict=safe with no findings", () => {
    const r = score({
      base: "a",
      head: "b",
      findings: [],
      workspaces: NO_WORKSPACES,
      totalChangedPackages: 0,
    });
    expect(r.verdict).toBe("safe");
    expect(r.prScore).toBe(0);
    expect(r.packages).toEqual([]);
  });

  it("groups findings by (ecosystem, packageName, packageVersion) and aggregates each", () => {
    const r = score({
      base: "a",
      head: "b",
      findings: [
        fi({ packageName: "a", code: "NEW_NETWORK_CALL", severity: "high" }),
        fi({ packageName: "b", code: "MAINTAINER_CHANGED", severity: "medium", confidence: 0.95 }),
      ],
      workspaces: NO_WORKSPACES,
      totalChangedPackages: 2,
    });
    expect(r.packages).toHaveLength(2);
    const aReport = r.packages.find((p) => p.packageName === "a");
    const bReport = r.packages.find((p) => p.packageName === "b");
    expect(aReport?.score).toBe(30); // 1 high direct conf 1.0 = 30
    expect(bReport?.score).toBe(11); // 1 medium × 0.95 × 1.0 × 1.0 = 11.4 → round 11
  });

  it("propagates hard-fail into verdict=block at the PR level", () => {
    const r = score({
      base: "a",
      head: "b",
      findings: [
        fi({
          packageName: "danger",
          code: "MALICIOUS_INSTALL_SCRIPT",
          severity: "critical",
          hardFail: true,
        }),
      ],
      workspaces: NO_WORKSPACES,
      totalChangedPackages: 1,
    });
    expect(r.verdict).toBe("block");
    expect(r.prScore).toBe(100);
    expect(r.hardFailCount).toBe(1);
    expect(r.topRisks[0]?.packageName).toBe("danger");
  });
});
