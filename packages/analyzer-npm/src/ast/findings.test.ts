import { describe, it, expect } from "vitest";
import { capabilityDiffToFindings } from "./findings.js";
import type { DependencyChange } from "@lockray/types";
import type { CapabilityDiff } from "./diff.js";

function baseChange(): DependencyChange {
  return {
    ecosystem: "npm",
    name: "pkg",
    fromVersion: "1.0.0",
    toVersion: "1.0.1",
    direct: true,
    manifestPath: "package.json",
    workspaceName: "root",
    integrityChanged: false,
    sourceChanged: false,
  };
}

function diff(overrides: Partial<CapabilityDiff> = {}): CapabilityDiff {
  return {
    matcher: "fetch",
    rule: "NEW_NETWORK_CALL",
    bucket: "install",
    beforePresent: false,
    afterPresent: true,
    afterFiles: ["scripts/postinstall.js"],
    sampleSnippet: `fetch("https://evil")`,
    ...overrides,
  };
}

describe("capabilityDiffToFindings", () => {
  it("one finding per (rule, bucket) with evidence-per-matcher when multiple matchers of the same rule fire in the same bucket", () => {
    const diffs: CapabilityDiff[] = [
      diff({ matcher: "fetch", sampleSnippet: `fetch("https://a")` }),
      diff({ matcher: "https.request", sampleSnippet: `https.request("https://b")` }),
    ];
    const findings = capabilityDiffToFindings(diffs, baseChange());
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.code).toBe("NEW_NETWORK_CALL");
    expect(f.contextBucket).toBe("install");
    expect(f.evidence.length).toBe(2);
    const matchers = f.evidence.map((e) => e.metadataField).sort();
    expect(matchers).toEqual(["ast.install.fetch", "ast.install.https.request"]);
  });

  it("emits two findings when same rule fires in both install and runtime", () => {
    const diffs: CapabilityDiff[] = [
      diff({ matcher: "fetch", bucket: "install" }),
      diff({ matcher: "fetch", bucket: "runtime", afterFiles: ["lib/a.js"] }),
    ];
    const findings = capabilityDiffToFindings(diffs, baseChange());
    expect(findings).toHaveLength(2);
    const buckets = findings.map((f) => f.contextBucket).sort();
    expect(buckets).toEqual(["install", "runtime"]);
  });

  it("evidence carries afterFiles count + confidenceReason mentioning before: false", () => {
    const diffs: CapabilityDiff[] = [
      diff({ afterFiles: ["a.js", "b.js", "c.js"] }),
    ];
    const findings = capabilityDiffToFindings(diffs, baseChange());
    const e = findings[0]!.evidence[0]!;
    expect(e.confidenceReason).toMatch(/Before: false/);
    expect(e.confidenceReason).toMatch(/a\.js, b\.js, c\.js/);
  });
});
