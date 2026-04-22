import type { ActionInputs, AnalyzeResult } from "./types.js";
export type ExecFn = (cmd: string, args: string[], opts?: {
    cwd?: string;
    listeners?: {
        stdout?: (buf: Buffer) => void;
        stderr?: (buf: Buffer) => void;
    };
    ignoreReturnCode?: boolean;
}) => Promise<number>;
export type WriteFileFn = (path: string, content: string) => Promise<void>;
export type UploadArtifactFn = (artifactName: string, files: string[], rootDirectory: string) => Promise<{
    id: number;
}>;
export interface AnalyzeDeps {
    exec: ExecFn;
    writeFile: WriteFileFn;
    uploadArtifact: UploadArtifactFn;
    prNumber: number;
    runId: number;
    headSha: string;
}
export declare function runAnalyzeJob(inputs: ActionInputs, deps: AnalyzeDeps): Promise<AnalyzeResult>;
