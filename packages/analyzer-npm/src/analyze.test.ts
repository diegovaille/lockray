import { describe, it, expect } from "vitest";
import { runAnalyze } from "./analyze.js";
import { createStubFetcher } from "./tarball/stub-fetcher.js";
import type { DependencyChange, FetchedPackage } from "@lockray/types";
import type { OSVClient } from "./cve/osv-client.js";

function stubOsv(empty = true): OSVClient {
  return {
    async queryPackage() {
      return empty ? [] : [{ id: "MAL-1", database_specific: { malicious: true } }];
    },
  };
}

function fetched(version: string, extras: Record<string, unknown> = {}): FetchedPackage {
  return {
    ecosystem: "npm",
    name: "pkg",
    version,
    integrity: "sha512-abc",
    packageJson: { name: "pkg", version, ...extras },
  };
}

describe("runAnalyze", () => {
  it("emits no findings for a benign version bump", async () => {
    const fetcher = createStubFetcher([fetched("1.0.0"), fetched("1.0.1")]);
    const findings = await runAnalyze(
      {
        ecosystem: "npm",
        name: "pkg",
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        direct: true,
        manifestPath: "package.json",
        workspaceName: "root",
        integrityChanged: false,
        sourceChanged: false,
      } satisfies DependencyChange,
      fetcher,
      stubOsv(),
      "hybrid",
    );
    expect(findings).toEqual([]);
  });

  it("returns empty for a removed package (no after version to fetch)", async () => {
    const fetcher = createStubFetcher([]);
    const findings = await runAnalyze(
      {
        ecosystem: "npm",
        name: "pkg",
        fromVersion: "1.0.0",
        toVersion: null,
        direct: true,
        manifestPath: "package.json",
        workspaceName: "root",
        integrityChanged: false,
        sourceChanged: false,
      } satisfies DependencyChange,
      fetcher,
      stubOsv(),
      "hybrid",
    );
    expect(findings).toEqual([]);
  });

  it("flags KNOWN_COMPROMISED_PACKAGE when OSV returns a malicious advisory", async () => {
    const fetcher = createStubFetcher([fetched("1.0.1")]);
    const findings = await runAnalyze(
      {
        ecosystem: "npm",
        name: "pkg",
        fromVersion: null,
        toVersion: "1.0.1",
        direct: true,
        manifestPath: "package.json",
        workspaceName: "root",
        integrityChanged: false,
        sourceChanged: false,
      } satisfies DependencyChange,
      fetcher,
      stubOsv(false),
      "hybrid",
    );
    expect(findings.some((f) => f.code === "KNOWN_COMPROMISED_PACKAGE" && f.hardFail)).toBe(true);
  });
});
