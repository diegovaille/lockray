export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type Ecosystem = "npm" | "pypi";
export type AnalysisMode = "direct" | "hybrid" | "full";
export type ParseOutcome =
  | "fully-supported"
  | "partially-supported"
  | "invalid"
  | "unsupported";

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
