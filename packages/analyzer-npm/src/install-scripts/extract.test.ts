import { describe, it, expect } from "vitest";
import { extractInstallScripts } from "./extract.js";

describe("extractInstallScripts", () => {
  it("returns all four hook names when all are present", () => {
    const scripts = extractInstallScripts({
      scripts: {
        preinstall: "echo pre",
        install: "echo install",
        postinstall: "echo post",
        prepare: "echo prepare",
      },
    });
    expect(scripts).toEqual({
      preinstall: "echo pre",
      install: "echo install",
      postinstall: "echo post",
      prepare: "echo prepare",
    });
  });

  it("returns an empty object when no scripts field is present", () => {
    expect(extractInstallScripts({})).toEqual({});
  });

  it("returns an empty object when scripts is not an object", () => {
    expect(extractInstallScripts({ scripts: "bogus" })).toEqual({});
  });

  it("ignores scripts that are not install hooks (e.g. test, build)", () => {
    expect(
      extractInstallScripts({
        scripts: { test: "vitest", build: "tsc", postinstall: "ok" },
      }),
    ).toEqual({ postinstall: "ok" });
  });
});
