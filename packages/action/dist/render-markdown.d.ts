import type { CliReport } from "@lockray/types";
export interface RenderOptions {
    /** Cap the number of findings printed in full. Overflow is summarized. */
    maxFindings?: number;
}
export declare function renderMarkdown(report: CliReport, opts?: RenderOptions): string;
