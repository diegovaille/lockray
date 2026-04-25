import { describe, it, expect } from "vitest";
import { collectCapabilities } from "./file-capabilities.js";
import { planCoverage } from "./coverage.js";

function files(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe("collectCapabilities", () => {
  it("splits capabilities across install and runtime buckets per coverage plan", () => {
    const srcFiles = files({
      "lib/index.js": `require("http").request({});`,           // runtime
      "scripts/postinstall.js": `fetch("https://evil");`,       // install (forced)
    });
    const pkg = {
      main: "./lib/index.js",
      scripts: { postinstall: "./scripts/postinstall.js" },
    };
    const plan = planCoverage(pkg, srcFiles);
    const result = collectCapabilities(srcFiles, plan);
    expect(result.install.some((c) => c.matcher === "fetch")).toBe(true);
    expect(result.runtime.some((c) => c.matcher === "http.request")).toBe(true);
    expect(result.install.some((c) => c.matcher === "http.request")).toBe(false);
    expect(result.runtime.some((c) => c.matcher === "fetch")).toBe(false);
  });

  it("accounts coverage counters correctly on a mixed 5-file fixture", () => {
    const big = "x".repeat(500_001);
    const srcFiles = files({
      "src/a.js": `console.log(1);`,                     // parsed runtime
      "tests/b.js": "1",                                 // non-runtime-path
      "docs/c.js": "1",                                  // non-runtime-path
      "scripts/postinstall.js": `fetch("https://x");`,   // parsed install (forced)
      "lib/huge.min.js": big,                            // minified-or-bundled
    });
    const pkg = { scripts: { postinstall: "./scripts/postinstall.js" } };
    const plan = planCoverage(pkg, srcFiles);
    const result = collectCapabilities(srcFiles, plan);
    expect(result.coverage.totalFiles).toBe(5);
    expect(result.coverage.parsed).toBe(2);
    expect(result.coverage.skipped["non-runtime-path"]).toBe(2);
    expect(result.coverage.skipped["minified-or-bundled"]).toBe(1);
    expect(result.coverage.errors).toBe(0);
  });

  it("parse errors are counted in coverage.errors and do not crash collection", () => {
    const srcFiles = files({
      "a.js": "const = ;",            // syntax error
      "b.js": `fetch("https://x");`,   // valid
    });
    const plan = planCoverage({}, srcFiles);
    const result = collectCapabilities(srcFiles, plan);
    expect(result.coverage.errors).toBe(1);
    expect(result.coverage.parsed).toBe(1);
    expect(result.runtime.some((c) => c.matcher === "fetch")).toBe(true);
  });

  it("forced-include file with invalid syntax increments errors counter and emits NO capability", () => {
    const srcFiles = files({
      "scripts/postinstall.js": "const broken = ;",
    });
    const pkg = { scripts: { postinstall: "./scripts/postinstall.js" } };
    const plan = planCoverage(pkg, srcFiles);
    const result = collectCapabilities(srcFiles, plan);
    expect(result.coverage.errors).toBe(1);
    expect(result.install).toEqual([]);
    expect(result.runtime).toEqual([]);
  });
});
