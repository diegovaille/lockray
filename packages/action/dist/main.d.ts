export interface TrustedReportIdentity {
    prNumber: number;
    headSha: string;
    failOnRisk: boolean;
}
/**
 * Derive the trusted report identity from the workflow_run event payload and
 * the report job's own action inputs. The payload is received directly from
 * GitHub by the privileged runner and cannot be tampered with by PR code.
 *
 * inputsPrNumber is used only as a fallback when workflow_run.pull_requests is
 * empty (e.g. a manually-triggered run); it is still a privileged caller-supplied
 * value, not artifact data. failOnRisk ALWAYS comes from the report job's own
 * action input — never from the analyze-job artifact.
 */
export declare function resolveTrustedReportIdentity(workflowRunPayload: unknown, inputsPrNumber: number | null, inputsFailOnRisk: boolean): TrustedReportIdentity;
export interface MetadataConsistencyWarning {
    field: "prNumber" | "headSha" | "failOnRisk";
    metadataValue: unknown;
    trustedValue: unknown;
}
/**
 * Compare analyze-job metadata against the trusted identity and return a list
 * of discrepancies. Used only for logging — callers must never use metadata
 * values to override the trusted identity.
 */
export declare function compareMetadataAgainstTrusted(metadata: {
    prNumber?: unknown;
    headSha?: unknown;
    failOnRisk?: unknown;
}, trusted: TrustedReportIdentity): MetadataConsistencyWarning[];
