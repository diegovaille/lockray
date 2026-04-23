import { describe, it, expect } from "vitest";
import type { Finding } from "@lockray/types";
import { contributionFor } from "./contribution.js";

function f(overrides: Partial<Finding> = {}): Finding {
  return {
    code: "CVE_VULNERABILITY",
    title: "test",
    severity: "high",
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

describe("contributionFor", () => {
  it("applies severity × confidence × location × diminishing", () => {
    // severity high (30) × confidence 0.8 × direct (1.0) × 1st occurrence (1.0) = 24
    expect(contributionFor(f({ severity: "high", confidence: 0.8 }), 0)).toBe(24);
  });

  it("returns 0 for info severity regardless of other multipliers", () => {
    expect(contributionFor(f({ severity: "info", confidence: 1.0 }), 0)).toBe(0);
  });

  it("applies the transitive 0.6 multiplier when direct is false and escalated is false", () => {
    // critical (75) × 1.0 × 0.6 × 1.0 = 45
    expect(contributionFor(f({ severity: "critical", direct: false, escalated: false }), 0)).toBe(45);
  });

  it("reverts to the direct multiplier when escalated=true", () => {
    // critical (75) × 1.0 × 1.0 × 1.0 = 75
    expect(contributionFor(f({ severity: "critical", direct: false, escalated: true }), 0)).toBe(75);
  });

  it("applies diminishing returns on the 2nd and 3rd+ occurrences", () => {
    const base = f({ severity: "high", confidence: 1.0 });
    // 1st: 30 * 1.0 = 30; 2nd: 30 * 0.6 = 18; 5th: 30 * 0.3 = 9
    expect(contributionFor(base, 0)).toBe(30);
    expect(contributionFor(base, 1)).toBe(18);
    expect(contributionFor(base, 5)).toBe(9);
  });

  it("clamps confidence to [0, 1]", () => {
    // out-of-range confidence should not produce an exotic score
    expect(contributionFor(f({ severity: "high", confidence: 1.5 }), 0)).toBe(30);
    expect(contributionFor(f({ severity: "high", confidence: -0.5 }), 0)).toBe(0);
  });
});
