import type {
  Analyzer,
  AnalysisMode,
  DependencyChange,
  Finding,
  ProjectInput,
} from "@lockray/types";

const SUPPORTED_LOCKFILES = ["package-lock.json", "pnpm-lock.yaml"] as const;

export class NpmAnalyzer implements Analyzer {
  public readonly ecosystem = "npm" as const;

  canHandle(files: string[]): boolean {
    return files.some((f) => {
      const basename = f.split("/").pop() ?? f;
      return (SUPPORTED_LOCKFILES as readonly string[]).includes(basename);
    });
  }

  async resolveChanges(
    _project: ProjectInput,
    _base: string,
    _head: string,
  ): Promise<DependencyChange[]> {
    throw new Error("NpmAnalyzer.resolveChanges: not implemented (wired in Task 9)");
  }

  async analyze(
    _change: DependencyChange,
    _mode: AnalysisMode,
  ): Promise<Finding[]> {
    throw new Error("NpmAnalyzer.analyze: not implemented in M1 (scheduled for M2+)");
  }
}
