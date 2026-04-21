import type { Ecosystem } from "@lockray/types";
import { OsvClientError } from "../errors.js";
import { OsvQueryResponseSchema, type OsvVulnerability } from "./types.js";

/**
 * Minimal transport interface — just enough for the client to post a
 * JSON query and receive a structured response. The CLI package
 * provides the real fetch()-based implementation.
 */
export interface OsvTransportResponse {
  status: number;
  body: unknown;
}

export type OsvTransport = (
  url: string,
  body: unknown,
) => Promise<OsvTransportResponse>;

export interface OSVClient {
  queryPackage(
    ecosystem: Ecosystem,
    name: string,
    version: string,
  ): Promise<OsvVulnerability[]>;
}

const OSV_QUERY_URL = "https://api.osv.dev/v1/query";

function ecosystemToOsv(eco: Ecosystem): string {
  switch (eco) {
    case "npm":
      return "npm";
    case "pypi":
      return "PyPI";
  }
}

export function createOsvClient(transport: OsvTransport): OSVClient {
  return {
    async queryPackage(ecosystem, name, version) {
      const query = {
        package: { name, ecosystem: ecosystemToOsv(ecosystem) },
        version,
      };

      let response: OsvTransportResponse;
      try {
        response = await transport(OSV_QUERY_URL, query);
      } catch (err) {
        throw new OsvClientError(
          `OSV network error querying ${name}@${version}: ${(err as Error).message}`,
          "NETWORK_ERROR",
        );
      }

      if (response.status === 429) {
        throw new OsvClientError(
          `OSV rate limit exceeded while querying ${name}@${version}`,
          "RATE_LIMITED",
        );
      }
      if (response.status !== 200) {
        throw new OsvClientError(
          `OSV HTTP ${response.status} for ${name}@${version}`,
          "HTTP_ERROR",
        );
      }

      const parsed = OsvQueryResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ");
        throw new OsvClientError(
          `OSV schema mismatch for ${name}@${version}: ${detail}`,
          "SCHEMA_MISMATCH",
        );
      }

      return parsed.data.vulns ?? [];
    },
  };
}
