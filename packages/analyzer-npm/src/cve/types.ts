import { z } from "zod";

/**
 * Partial shape of an OSV vulnerability entry. OSV schema is large; we
 * validate only the fields we consume and passthrough the rest.
 *
 * Reference: https://ossf.github.io/osv-schema/
 */
export const OsvSeveritySchema = z.object({
  type: z.string(),
  score: z.string(),
});

export const OsvAffectedSchema = z
  .object({
    package: z
      .object({
        name: z.string().optional(),
        ecosystem: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const OsvVulnerabilitySchema = z
  .object({
    id: z.string(),
    summary: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    database_specific: z
      .object({
        severity: z.string().optional(),
        malicious: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    severity: z.array(OsvSeveritySchema).optional(),
    affected: z.array(OsvAffectedSchema).optional(),
  })
  .passthrough();

export const OsvQueryResponseSchema = z
  .object({
    vulns: z.array(OsvVulnerabilitySchema).optional(),
  })
  .passthrough();

export type OsvVulnerability = z.infer<typeof OsvVulnerabilitySchema>;
export type OsvQueryResponse = z.infer<typeof OsvQueryResponseSchema>;

export type OsvSeverityLevel = "critical" | "high" | "medium" | "low" | "unknown";

/**
 * Normalizes the heterogeneous severity fields OSV exposes
 * (database_specific.severity is a free string; severity[] carries CVSS).
 * Returns "unknown" when no reliable signal is present; that maps to
 * INFO severity in the classifier.
 */
export function normalizeOsvSeverity(v: OsvVulnerability): OsvSeverityLevel {
  const dbSpec = v.database_specific?.severity?.toLowerCase();
  if (dbSpec === "critical" || dbSpec === "high" || dbSpec === "medium" || dbSpec === "low") {
    return dbSpec;
  }
  const cvss = v.severity?.find((s) => s.type === "CVSS_V3")?.score;
  if (cvss) {
    const base = Number.parseFloat(cvss.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? "");
    if (!Number.isNaN(base)) {
      if (base >= 9.0) return "critical";
      if (base >= 7.0) return "high";
      if (base >= 4.0) return "medium";
      if (base > 0.0) return "low";
    }
  }
  return "unknown";
}

/**
 * True when an OSV vuln entry specifically indicates malicious-package
 * status (as opposed to a conventional CVE). The `database_specific.malicious`
 * flag is the primary signal; the `MAL-` id prefix used by osv.dev for
 * malicious-packages advisories is the fallback.
 */
export function isMaliciousPackageAdvisory(v: OsvVulnerability): boolean {
  if (v.database_specific?.malicious === true) return true;
  return v.id.startsWith("MAL-");
}
