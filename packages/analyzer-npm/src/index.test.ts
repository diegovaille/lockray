import { describe, it, expect } from "vitest";
import { NpmAnalyzer, createStubFetcher } from "./index.js";
import type { OSVClient } from "./cve/osv-client.js";

const stubGitShow = async () => null;
const stubOsv: OSVClient = { async queryPackage() { return []; } };
const stubFetcher = createStubFetcher([]);

describe("NpmAnalyzer", () => {
  const analyzer = new NpmAnalyzer({
    gitShow: stubGitShow,
    fetcher: stubFetcher,
    osv: stubOsv,
  });

  it("declares ecosystem = 'npm'", () => {
    expect(analyzer.ecosystem).toBe("npm");
  });

  it("canHandle returns true for package-lock.json", () => {
    expect(analyzer.canHandle(["package-lock.json"])).toBe(true);
  });

  it("canHandle returns true for pnpm-lock.yaml", () => {
    expect(analyzer.canHandle(["pnpm-lock.yaml"])).toBe(true);
  });

  it("canHandle returns false for yarn.lock (deferred to v1.1)", () => {
    expect(analyzer.canHandle(["yarn.lock"])).toBe(false);
  });

  it("canHandle returns false for poetry.lock", () => {
    expect(analyzer.canHandle(["poetry.lock"])).toBe(false);
  });

  it("analyze returns [] for a change that has no fetchable tarballs", async () => {
    const findings = await analyzer.analyze(
      {
        ecosystem: "npm",
        name: "x",
        fromVersion: "1.0.0",
        toVersion: "1.0.1",
        direct: true,
        manifestPath: "package.json",
        workspaceName: "root",
        integrityChanged: false,
        sourceChanged: false,
      },
      "hybrid",
    );
    expect(findings).toEqual([]);
  });
});
