import { describe, it, expect } from "vitest";
import { parsePackageJson } from "./package-json.js";

describe("parsePackageJson", () => {
  it("returns union of all dependency-type fields", () => {
    const raw = JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dependencies: { lodash: "^4", chalk: "^5" },
      devDependencies: { vitest: "^2" },
      optionalDependencies: { fsevents: "^2" },
      peerDependencies: { react: "^18" },
    });
    const { directDeps } = parsePackageJson(raw);
    expect([...directDeps].sort()).toEqual(
      ["chalk", "fsevents", "lodash", "react", "vitest"],
    );
  });

  it("returns empty set when no dependency fields exist", () => {
    const { directDeps } = parsePackageJson('{"name":"x","version":"1"}');
    expect(directDeps.size).toBe(0);
  });

  it("throws on invalid JSON", () => {
    expect(() => parsePackageJson("{ not json")).toThrow(/invalid json/i);
  });
});
