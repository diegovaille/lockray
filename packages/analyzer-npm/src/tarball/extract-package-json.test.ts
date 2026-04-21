import { describe, it, expect } from "vitest";
import { extractRootPackageJson } from "./extract-package-json.js";

describe("extractRootPackageJson", () => {
  it("returns the parsed package.json when present at the tarball root", () => {
    const files = new Map<string, string>([
      ["package/package.json", '{"name":"x","version":"1.0.0"}'],
      ["package/index.js", "module.exports = {};"],
    ]);
    const pkg = extractRootPackageJson(files);
    expect(pkg).toEqual({ name: "x", version: "1.0.0" });
  });

  it("handles the npm convention of a leading 'package/' prefix", () => {
    const files = new Map([["package/package.json", '{"name":"y"}']]);
    expect(extractRootPackageJson(files)).toEqual({ name: "y" });
  });

  it("throws TarballFetchError with INVALID_ARCHIVE when no package.json is at the root", () => {
    const files = new Map([["package/sub/package.json", '{"name":"nested"}']]);
    expect(() => extractRootPackageJson(files)).toThrow(/package\.json.*not found/i);
  });

  it("throws TarballFetchError with INVALID_ARCHIVE on malformed JSON", () => {
    const files = new Map([["package/package.json", "{ not json"]]);
    expect(() => extractRootPackageJson(files)).toThrow(/invalid json/i);
  });
});
