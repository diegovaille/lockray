import { describe, it, expect } from "vitest";
import { createStubFetcher } from "./stub-fetcher.js";

describe("createStubFetcher", () => {
  it("returns the FetchedPackage registered for a given (eco,name,version)", async () => {
    const fetch = createStubFetcher([
      {
        ecosystem: "npm",
        name: "lodash",
        version: "4.17.20",
        integrity: "sha512-abc",
        packageJson: { name: "lodash", version: "4.17.20" },
      },
    ]);
    const fetched = await fetch("npm", "lodash", "4.17.20");
    expect(fetched.packageJson).toEqual({ name: "lodash", version: "4.17.20" });
    expect(fetched.integrity).toBe("sha512-abc");
  });

  it("throws NOT_FOUND when the tuple is not in the registry", async () => {
    const fetch = createStubFetcher([]);
    await expect(fetch("npm", "missing", "1.0.0")).rejects.toThrow(/not found/i);
  });
});
