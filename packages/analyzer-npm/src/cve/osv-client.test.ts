import { describe, it, expect } from "vitest";
import { createOsvClient } from "./osv-client.js";

describe("OSVClient", () => {
  it("returns empty array when OSV has no vulns for the package", async () => {
    const transport = async () => ({ status: 200, body: {} });
    const client = createOsvClient(transport);
    const vulns = await client.queryPackage("npm", "lodash", "4.17.20");
    expect(vulns).toEqual([]);
  });

  it("parses a single vulnerability response", async () => {
    const transport = async () => ({
      status: 200,
      body: {
        vulns: [
          {
            id: "GHSA-fvqr-27wr-82fm",
            summary: "Prototype pollution in lodash",
            severity: [{ type: "CVSS_V3", score: "7.5/CVSS:3.1/..." }],
          },
        ],
      },
    });
    const client = createOsvClient(transport);
    const vulns = await client.queryPackage("npm", "lodash", "4.17.20");
    expect(vulns).toHaveLength(1);
    expect(vulns[0].id).toBe("GHSA-fvqr-27wr-82fm");
  });

  it("throws OsvClientError on non-200 status", async () => {
    const transport = async () => ({ status: 503, body: "service unavailable" });
    const client = createOsvClient(transport);
    await expect(
      client.queryPackage("npm", "lodash", "4.17.20"),
    ).rejects.toThrow(/http.*503/i);
  });

  it("throws OsvClientError on schema mismatch", async () => {
    const transport = async () => ({
      status: 200,
      body: { vulns: [{ missingId: true }] },
    });
    const client = createOsvClient(transport);
    await expect(
      client.queryPackage("npm", "lodash", "4.17.20"),
    ).rejects.toThrow(/schema mismatch/i);
  });
});
