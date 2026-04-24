export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type Ecosystem = "npm" | "pypi";
export type AnalysisMode = "direct" | "hybrid" | "full";
export type ParseOutcome =
  | "fully-supported"
  | "partially-supported"
  | "invalid"
  | "unsupported"
  | "missing";

export interface Evidence {
  kind: "code-snippet" | "metadata" | "registry" | "advisory" | "repo" | "heuristic";
  filePath?: string;
  oldSnippet?: string;
  newSnippet?: string;
  metadataField?: string;
  oldValue?: string;
  newValue?: string;
  registryUrl?: string;
  advisoryId?: string;
  confidenceReason?: string;
  remediationHint?: string;
}

export interface Finding {
  code: string;
  title: string;
  severity: Severity;
  confidence: number;
  evidence: Evidence[];
  ecosystem: Ecosystem;
  packageName: string;
  packageVersion: string;
  direct: boolean;
  escalated: boolean;
  hardFail?: boolean;
  /** M4.2+: which runtime context the AST detected the capability in.
   *  Undefined for non-AST findings and findings that predate M4.2;
   *  preserves legacy compound-bonus semantics for those. */
  contextBucket?: "install" | "runtime";
}

export interface DependencyChange {
  ecosystem: Ecosystem;
  name: string;
  fromVersion: string | null;
  toVersion: string | null;
  direct: boolean;
  manifestPath: string;
  workspaceName: string;
  integrityChanged: boolean;
  sourceChanged: boolean;
  /** Resolved source URL at base ref, when known; null when absent or same-value. */
  resolvedBefore?: string | null;
  /** Resolved source URL at head ref, when known; null when absent or same-value. */
  resolvedAfter?: string | null;
  /** Integrity hash at base ref, when integrityChanged is true; null when absent. */
  integrityBefore?: string | null;
  /** Integrity hash at head ref, when integrityChanged is true; null when absent. */
  integrityAfter?: string | null;
}

export interface ProjectInput {
  workspaceName: string;
  rootPath: string;
  ecosystem: Ecosystem;
  manifestPaths: string[];
  lockfilePath: string;
  parseOutcome: ParseOutcome;
}

export interface Analyzer {
  ecosystem: Ecosystem;
  canHandle(files: string[]): boolean;
  resolveChanges(
    project: ProjectInput,
    base: string,
    head: string,
  ): Promise<DependencyChange[]>;
  analyze(change: DependencyChange, mode: AnalysisMode): Promise<Finding[]>;
}

export type GitShowFn = (ref: string, path: string) => Promise<string | null>;

/**
 * A tarball fetched from a package registry, staged for analysis.
 *
 * `packageJson` is the JSON-parsed root package.json extracted from the
 * tarball — that is the one piece of metadata every M2 detection rule
 * needs. Additional file access (for AST analysis in M4) will extend
 * this shape later.
 */
export interface FetchedPackage {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  integrity: string | null;
  packageJson: Record<string, unknown>;
  /** M4.2+: POSIX-relative tarball-root paths → UTF-8 file contents.
   *  Populated by fetchers that can supply source-level data.
   *  Legacy fetchers may omit; AST analysis no-ops when absent. */
  sourceFiles?: ReadonlyMap<string, string>;
}

/**
 * Injectable tarball-fetching dependency. The analyzer package is kept
 * free of `pacote`/network concerns by taking this through DI in the
 * same way as GitShowFn.
 */
export type TarballFetcher = (
  ecosystem: Ecosystem,
  name: string,
  version: string,
) => Promise<FetchedPackage>;

/**
 * User-facing LockRay error with a stable machine-readable code.
 * Code values are documented per call-site; analyzers may subclass.
 */
export class LockrayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "LockrayError";
  }
}

/**
 * Shape of the JSON emitted by `lockray check --format json`.
 * Kept in @lockray/types so the CLI, the Action, and external tooling
 * all refer to one definition. Changes to this shape are breaking.
 */
export interface CliWorkspaceReport {
  workspace: string;
  ecosystem: Ecosystem;
  parseOutcome: ParseOutcome;
  changes: DependencyChange[];
  findings: Finding[];
}

export interface CliReport {
  base: string;
  head: string;
  workspaces: CliWorkspaceReport[];
  /** Flattened changes across all workspaces (equals workspaces.flatMap(w => w.changes)). */
  changes: DependencyChange[];
  /** Flattened findings across all workspaces (equals workspaces.flatMap(w => w.findings)). */
  findings: Finding[];
  /** True if any finding carries hardFail === true. Extended in M4 to include score-based blocking. */
  blocked: boolean;
}

/**
 * User-facing verdict per spec §9. Maps one-to-one to the score thresholds
 * defined in @lockray/scoring (0-29 safe, 30-59 review, 60-100 block) —
 * but the verdict is itself the authoritative consumer-facing value;
 * downstream code should branch on `verdict`, not on the numeric score.
 */
export type Verdict = "safe" | "review" | "block";

/**
 * Per-package aggregate. Produced by @lockray/scoring from the findings
 * attached to a single (ecosystem, name) change. Stable external contract —
 * additions are non-breaking, removals or renames require a major bump.
 */
export interface PackageReport {
  ecosystem: Ecosystem;
  packageName: string;
  packageVersion: string;
  direct: boolean;
  /** Capped at 100. When any finding has hardFail=true, score=100 regardless. */
  score: number;
  verdict: Verdict;
  /** True when any of this package's findings carried hardFail=true. */
  hardFail: boolean;
  findings: readonly Finding[];
}

/**
 * Top-level report shape emitted by `lockray check --format json`'s
 * future evolution. Replaces the ad-hoc `CliReport.blocked` boolean
 * consumers used in v0.2.x, while keeping that field as a backwards-
 * compatible view (`blocked === (verdict === "block")`).
 */
export interface PrReport {
  base: string;
  head: string;
  /** max(PackageReport.score) across all packages; drives the verdict. */
  prScore: number;
  verdict: Verdict;
  /** Packages with verdict !== "safe". */
  flaggedPackageCount: number;
  /** Packages with verdict === "review". */
  reviewCount: number;
  /** Packages with verdict === "block". */
  blockCount: number;
  /** Packages with hardFail=true. */
  hardFailCount: number;
  /** flaggedPackageCount / max(1, totalChangedPackages). 0–1. */
  riskDensity: number;
  /** Top 3 flagged packages by score, descending. */
  topRisks: readonly PackageReport[];
  packages: readonly PackageReport[];
  workspaces: readonly CliWorkspaceReport[];
}
