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
