import { describe, it, expect } from "vitest";
import type { Finding } from "@lockray/types";
import { buildPackageReport } from "./package-report.js";

function f(code: string, severity: Finding["severity"], overrides: Partial<Finding> = {}): Finding {
  return {
    code,
    title: "t",
    severity,
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

describe("buildPackageReport", () => {
  it("returns verdict=safe and score=0 when the package has no findings", () => {
    const r = buildPackageReport(
      { ecosystem: "npm", packageName: "pkg", packageVersion: "1.0.0", direct: true },
      [],
    );
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("safe");
    expect(r.hardFail).toBe(false);
  });

  it("sums contributions, adds compound bonuses, and caps at 100", () => {
    // 5 critical findings with distinct codes: 5 × 75 = 375 → capped at 100, verdict block
    const findings = Array.from({ length: 5 }, (_, i) =>
      f(`CRIT_${i}`, "critical"),
    );
    const r = buildPackageReport(
      { ecosystem: "npm", packageName: "pkg", packageVersion: "1.0.0", direct: true },
      findings,
    );
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("block");
  });

  it("forces score=100 and verdict=block when any finding has hardFail=true", () => {
    const findings = [f("HARD", "low", { hardFail: true })];
    const r = buildPackageReport(
      { ecosystem: "npm", packageName: "pkg", packageVersion: "1.0.0", direct: true },
      findings,
    );
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("block");
    expect(r.hardFail).toBe(true);
  });

  it("applies diminishing returns to repeated codes within the same package", () => {
    // 3 identical-code high findings, direct, confidence 1.0:
    // 1st: 30 × 1.0 = 30; 2nd: 30 × 0.6 = 18; 3rd: 30 × 0.3 = 9 → 57 → review
    const findings = [
      f("NEW_NETWORK_CALL", "high"),
      f("NEW_NETWORK_CALL", "high"),
      f("NEW_NETWORK_CALL", "high"),
    ];
    const r = buildPackageReport(
      { ecosystem: "npm", packageName: "pkg", packageVersion: "1.0.0", direct: true },
      findings,
    );
    expect(r.score).toBe(57);
    expect(r.verdict).toBe("review");
  });
});
