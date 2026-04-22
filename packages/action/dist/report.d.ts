import type { CliReport } from "@lockray/types";
export interface ReportJobParams {
    owner: string;
    repo: string;
    prNumber: number;
    headSha: string;
    failOnRisk: boolean;
    report: CliReport;
}
/**
 * Minimal subset of the Octokit shape we need. Defined here (not
 * imported from @octokit/rest) so tests can stub without pulling the
 * full typings.
 */
export interface OctokitLike {
    rest: {
        issues: {
            listComments: (args: {
                owner: string;
                repo: string;
                issue_number: number;
                per_page?: number;
            }) => Promise<{
                data: ReadonlyArray<{
                    id: number;
                    body?: string;
                }>;
            }>;
            createComment: (args: {
                owner: string;
                repo: string;
                issue_number: number;
                body: string;
            }) => Promise<{
                data: {
                    id: number;
                };
            }>;
            updateComment: (args: {
                owner: string;
                repo: string;
                comment_id: number;
                body: string;
            }) => Promise<{
                data: {
                    id: number;
                };
            }>;
        };
        checks: {
            create: (args: {
                owner: string;
                repo: string;
                name: string;
                head_sha: string;
                status: "completed";
                conclusion: "success" | "failure";
                output?: {
                    title: string;
                    summary: string;
                };
            }) => Promise<{
                data: {
                    id: number;
                };
            }>;
        };
    };
}
export interface ReportJobDeps {
    octokit: OctokitLike;
}
export declare function runReportJob(params: ReportJobParams, deps: ReportJobDeps): Promise<void>;
