import type {
  Analyzer,
  AnalysisMode,
  DependencyChange,
  Finding,
  GitShowFn,
  ProjectInput,
} from "@lockray/types";
import { resolveNpmChanges } from "./resolve-changes.js";

const SUPPORTED_LOCKFILES = ["package-lock.json", "pnpm-lock.yaml"] as const;

export class NpmAnalyzer implements Analyzer {
  public readonly ecosystem = "npm" as const;

  constructor(private readonly gitShow: GitShowFn) {}

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
    return resolveNpmChanges(project, base, head, this.gitShow);
  }

  async analyze(
    _change: DependencyChange,
    _mode: AnalysisMode,
  ): Promise<Finding[]> {
    throw new Error(
      "NpmAnalyzer.analyze: not implemented in M1 (scheduled for M2+)",
    );
  }
}
