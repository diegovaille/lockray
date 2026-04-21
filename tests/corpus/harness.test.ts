import { describe, it, expect } from "vitest";
import { NpmAnalyzer, createStubFetcher, type OSVClient } from "@lockray/analyzer-npm";
import {
  buildChange,
  loadCorpusManifest,
  loadFixturePackage,
} from "./helpers.js";

const stubGitShow = async () => null;
const emptyOsv: OSVClient = { async queryPackage() { return []; } };

const manifest = loadCorpusManifest();

describe("corpus harness", () => {
  for (const fixture of manifest.fixtures) {
    it(`${fixture.dir}: ${fixture.scenario}`, async () => {
      const before = loadFixturePackage(fixture, "before");
      const after = loadFixturePackage(fixture, "after");
      const fetcher = createStubFetcher([before, after]);
      const analyzer = new NpmAnalyzer({
        gitShow: stubGitShow,
        fetcher,
        osv: emptyOsv,
      });

      const change = buildChange(fixture);
      const findings = await analyzer.analyze(change, "hybrid");

      const blocked = findings.some((f) => f.hardFail === true);
      expect(blocked).toBe(fixture.expect.blocked);

      const codes = findings.map((f) => f.code).sort();
      for (const expected of fixture.expect.findingCodes) {
        expect(codes).toContain(expected);
      }
    });
  }
});
