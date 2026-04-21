import type {
  Analyzer,
  AnalysisMode,
  DependencyChange,
  Finding,
  GitShowFn,
  ProjectInput,
  TarballFetcher,
} from "@lockray/types";
import { resolveNpmChanges } from "./resolve-changes.js";
import { runAnalyze } from "./analyze.js";
import type { OSVClient } from "./cve/osv-client.js";

export { LockfileParseError, OsvClientError, TarballFetchError } from "./errors.js";
export { createOsvClient, type OSVClient, type OsvTransport, type OsvTransportResponse } from "./cve/osv-client.js";
export { createStubFetcher } from "./tarball/stub-fetcher.js";
export { FindingCode } from "./findings/codes.js";

const SUPPORTED_LOCKFILES = ["package-lock.json", "pnpm-lock.yaml"] as const;

export interface NpmAnalyzerDeps {
  gitShow: GitShowFn;
  fetcher: TarballFetcher;
  osv: OSVClient;
}

export class NpmAnalyzer implements Analyzer {
  public readonly ecosystem = "npm" as const;

  constructor(private readonly deps: NpmAnalyzerDeps) {}

  canHandle(files: string[]): boolean {
    return files.some((f) => {
      const base = f.split("/").pop() ?? f;
      return (SUPPORTED_LOCKFILES as readonly string[]).includes(base);
    });
  }

  async resolveChanges(
    project: ProjectInput,
    base: string,
    head: string,
  ): Promise<DependencyChange[]> {
    return resolveNpmChanges(project, base, head, this.deps.gitShow);
  }

  async analyze(
    change: DependencyChange,
    mode: AnalysisMode,
  ): Promise<Finding[]> {
    return runAnalyze(change, this.deps.fetcher, this.deps.osv, mode);
  }
}
