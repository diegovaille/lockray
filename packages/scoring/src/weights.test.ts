import { describe, it, expect } from "vitest";
import {
  DEFAULT_SEVERITY_WEIGHTS,
  DEFAULT_LOCATION_MULTIPLIERS,
  DEFAULT_DIMINISHING,
  DEFAULT_THRESHOLDS,
  DEFAULT_COMPOUND_BONUSES,
} from "./weights.js";

describe("scoring weights defaults", () => {
  it("exposes severity weights matching spec §9 (critical=75, high=30, medium=12, low=4, info=0)", () => {
    expect(DEFAULT_SEVERITY_WEIGHTS).toEqual({
      critical: 75,
      high: 30,
      medium: 12,
      low: 4,
      info: 0,
    });
  });

  it("exposes location multipliers: direct=1.0, transitive=0.6, transitive-escalated=1.0", () => {
    expect(DEFAULT_LOCATION_MULTIPLIERS).toEqual({
      direct: 1.0,
      transitive: 0.6,
      transitiveEscalated: 1.0,
    });
  });

  it("exposes the diminishing-returns curve 1.0 / 0.6 / 0.3 / 0.3...", () => {
    expect(DEFAULT_DIMINISHING(0)).toBe(1.0);
    expect(DEFAULT_DIMINISHING(1)).toBe(0.6);
    expect(DEFAULT_DIMINISHING(2)).toBe(0.3);
    expect(DEFAULT_DIMINISHING(5)).toBe(0.3);
  });

  it("exposes verdict thresholds: safe < 30 <= review < 60 <= block", () => {
    expect(DEFAULT_THRESHOLDS.review).toBe(30);
    expect(DEFAULT_THRESHOLDS.block).toBe(60);
  });

  it("exposes the three spec §8 compound-bonus combinations", () => {
    expect(DEFAULT_COMPOUND_BONUSES).toEqual([
      { codes: ["NEW_NETWORK_CALL", "NEW_CREDENTIAL_ACCESS"], bonus: 20 },
      { codes: ["NEW_POSTINSTALL_SCRIPT", "OBFUSCATED_CODE"], bonus: 25 },
      { codes: ["MAINTAINER_CHANGED", "NEW_NETWORK_CALL"], bonus: 15 },
    ]);
  });
});
