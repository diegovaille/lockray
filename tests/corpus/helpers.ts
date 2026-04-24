import { readFileSync } from "node:fs";
import { join } from "node:path";
import { score } from "@lockray/scoring";
import type { CliWorkspaceReport, DependencyChange, FetchedPackage, Finding, PrReport } from "@lockray/types";

export interface CorpusFixture {
  dir: string;
  scenario: string;
  before: { version: string; pkg: string };
  after: { version: string; pkg: string };
  synthetic?: { integrityChanged?: boolean; sourceChanged?: boolean };
  expect: { blocked: boolean; findingCodes: string[] };
}

export interface CorpusManifest {
  fixtures: CorpusFixture[];
}

const CORPUS_ROOT = join(process.cwd(), "tests/fixtures/corpus");

export function loadCorpusManifest(): CorpusManifest {
  const raw = readFileSync(join(CORPUS_ROOT, "manifest.json"), "utf8");
  return JSON.parse(raw) as CorpusManifest;
}

export function loadFixturePackage(
  fixture: CorpusFixture,
  which: "before" | "after",
): FetchedPackage {
  const side = fixture[which];
  const pkgPath = join(CORPUS_ROOT, fixture.dir, side.pkg, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  return {
    ecosystem: "npm",
    name: String(pkg.name ?? ""),
    version: side.version,
    integrity: `sha512-${which}-${fixture.dir}`,
    packageJson: pkg,
  };
}

export function buildChange(fixture: CorpusFixture): DependencyChange {
  const name = String(loadFixturePackage(fixture, "after").name);
  const change: DependencyChange = {
    ecosystem: "npm",
    name,
    fromVersion: fixture.before.version,
    toVersion: fixture.after.version,
    direct: true,
    manifestPath: "package.json",
    workspaceName: "root",
    integrityChanged: fixture.synthetic?.integrityChanged ?? false,
    sourceChanged: fixture.synthetic?.sourceChanged ?? false,
  };

  // Populate synthetic hash/URL evidence so the classifier's INTEGRITY_MISMATCH
  // and NEW_DEPENDENCY_SOURCE findings carry full evidence rather than empty values.
  if (fixture.synthetic?.integrityChanged) {
    change.integrityBefore = `sha512-synthetic-before-${fixture.dir}`;
    change.integrityAfter = `sha512-synthetic-after-${fixture.dir}`;
  }
  if (fixture.synthetic?.sourceChanged) {
    change.resolvedBefore = `https://registry.npmjs.org/foo/-/foo-1.0.0.tgz`;
    change.resolvedAfter = `https://evil-mirror.example/foo/-/foo-1.0.0.tgz`;
  }

  return change;
}

/**
 * Run the full @lockray/scoring pipeline against a fixture's findings.
 * Synthetic workspaces array so the harness gets a realistic PrReport
 * with verdict + prScore + counts.
 */
export function scoreFixtureFindings(findings: Finding[]): PrReport {
  // Synthetic workspace carrying the findings so PrReport.workspaces
  // matches the shape the CLI emits.
  const workspaces: CliWorkspaceReport[] = [
    {
      workspace: "root",
      ecosystem: "npm",
      parseOutcome: "fully-supported",
      changes: [],
      findings,
    },
  ];
  return score({
    base: "before",
    head: "after",
    findings,
    workspaces,
    totalChangedPackages: 1,
  });
}
