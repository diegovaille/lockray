import { describe, it, expect } from "vitest";
import { NpmAnalyzer, createStubFetcher, type OSVClient } from "@lockray/analyzer-npm";
import type { Verdict } from "@lockray/types";
import {
  buildChange,
  loadCorpusManifest,
  loadFixturePackage,
  scoreFixtureFindings,
} from "./helpers.js";

const stubGitShow = async () => null;
const emptyOsv: OSVClient = { async queryPackage() { return []; } };

const manifest = loadCorpusManifest();

describe("corpus harness", () => {
  for (const fixture of manifest.fixtures) {
    it(`${fixture.dir}: ${fixture.scenario}`, async () => {
      const before = await loadFixturePackage(fixture, "before");
      const after = await loadFixturePackage(fixture, "after");
      const fetcher = createStubFetcher([before, after]);
      const analyzer = new NpmAnalyzer({
        gitShow: stubGitShow,
        fetcher,
        osv: emptyOsv,
      });

      const change = buildChange(fixture, after.name);
      const findings = await analyzer.analyze(change, "hybrid");
      const prReport = scoreFixtureFindings(findings);

      // Verdict is the authoritative consumer-facing value.
      const expectedVerdict: Verdict = fixture.expect.blocked
        ? "block"
        : fixture.expect.findingCodes.length > 0
        ? "review"
        : "safe";
      expect(prReport.verdict).toBe(expectedVerdict);

      // Legacy blocked view still held for backwards compat.
      const blocked = prReport.verdict === "block";
      expect(blocked).toBe(fixture.expect.blocked);

      // Finding codes still as before. NOTE: containment-only — `findingCodes: []`
      // does NOT mean "no findings emitted"; it means "we don't assert any specific
      // code." The verdict above is the exhaustive assertion.
      const codes = findings.map((f) => f.code).sort();
      for (const expected of fixture.expect.findingCodes) {
        expect(codes).toContain(expected);
      }
    });
  }
});
