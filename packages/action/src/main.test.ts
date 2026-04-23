import { describe, it, expect } from "vitest";
import {
  resolveTrustedReportIdentity,
  compareMetadataAgainstTrusted,
} from "./main.js";

describe("resolveTrustedReportIdentity (forgery resistance)", () => {
  it("returns PR + SHA from the workflow_run payload, ignoring any inputs fallback when payload has both", () => {
    const result = resolveTrustedReportIdentity(
      {
        pull_requests: [{ number: 42 }],
        head_sha: "trusted-sha-abc",
      },
      99999,
      true,
    );
    expect(result).toEqual({
      prNumber: 42,
      headSha: "trusted-sha-abc",
      failOnRisk: true,
    });
  });

  it("falls back to inputs.prNumber only when workflow_run payload has no pull_requests", () => {
    const result = resolveTrustedReportIdentity(
      { head_sha: "trusted-sha", pull_requests: [] },
      77,
      false,
    );
    expect(result.prNumber).toBe(77);
    expect(result.headSha).toBe("trusted-sha");
  });

  it("throws when neither payload nor inputs can supply a PR number", () => {
    expect(() => resolveTrustedReportIdentity({ head_sha: "abc" }, null, true)).toThrow(
      /could not resolve a trusted PR number/i,
    );
  });

  it("throws when workflow_run payload lacks head_sha", () => {
    expect(() =>
      resolveTrustedReportIdentity({ pull_requests: [{ number: 1 }] }, null, true),
    ).toThrow(/head_sha/i);
  });

  it("ALWAYS takes failOnRisk from the report-job input, never from anywhere in the payload", () => {
    // Even if somebody crafted a payload that looked like it had failOnRisk
    // (it doesn't — workflow_run has no such field — but the shape is unknown),
    // we must only return inputsFailOnRisk.
    const result = resolveTrustedReportIdentity(
      {
        pull_requests: [{ number: 10 }],
        head_sha: "sha",
        failOnRisk: false, // forged
      } as unknown,
      null,
      true, // trusted
    );
    expect(result.failOnRisk).toBe(true);
  });
});

describe("compareMetadataAgainstTrusted (forgery surfacing)", () => {
  it("reports zero warnings when metadata matches trusted values", () => {
    const warnings = compareMetadataAgainstTrusted(
      { prNumber: 10, headSha: "abc", failOnRisk: true },
      { prNumber: 10, headSha: "abc", failOnRisk: true },
    );
    expect(warnings).toEqual([]);
  });

  it("flags prNumber forgery", () => {
    const warnings = compareMetadataAgainstTrusted(
      { prNumber: 999 },
      { prNumber: 10, headSha: "abc", failOnRisk: true },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ field: "prNumber", metadataValue: 999, trustedValue: 10 });
  });

  it("flags all three fields when fully forged", () => {
    const warnings = compareMetadataAgainstTrusted(
      { prNumber: 999, headSha: "attacker", failOnRisk: false },
      { prNumber: 10, headSha: "trusted", failOnRisk: true },
    );
    expect(warnings.map((w) => w.field).sort()).toEqual(["failOnRisk", "headSha", "prNumber"]);
  });

  it("does not flag fields absent from metadata", () => {
    const warnings = compareMetadataAgainstTrusted(
      {}, // nothing to compare
      { prNumber: 10, headSha: "abc", failOnRisk: true },
    );
    expect(warnings).toEqual([]);
  });
});
