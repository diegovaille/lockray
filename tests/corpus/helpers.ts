import { readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
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

const ALLOWED_SOURCE_EXTENSIONS = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"];

async function listSourceFiles(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // dir may not exist for some fixtures
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        if (e.name === "package.json") continue; // handled separately
        const ext = ALLOWED_SOURCE_EXTENSIONS.find((x) => e.name.endsWith(x));
        if (!ext) continue;
        const s = await stat(full);
        if (s.size > 500_000) continue;
        const content = await readFile(full, "utf8");
        const rel = relative(root, full).split(sep).join("/");
        out.set(rel, content);
      }
    }
  }

  await walk(root);
  return out;
}

export async function loadFixturePackage(
  fixture: CorpusFixture,
  which: "before" | "after",
): Promise<FetchedPackage> {
  const side = fixture[which];
  const pkgRoot = join(CORPUS_ROOT, fixture.dir, side.pkg);
  const pkgPath = join(pkgRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  const sourceFiles = await listSourceFiles(pkgRoot);
  return {
    ecosystem: "npm",
    name: String(pkg.name ?? ""),
    version: side.version,
    integrity: `sha512-${which}-${fixture.dir}`,
    packageJson: pkg,
    sourceFiles,
  } satisfies FetchedPackage;
}

export function buildChange(fixture: CorpusFixture, name: string): DependencyChange {
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
