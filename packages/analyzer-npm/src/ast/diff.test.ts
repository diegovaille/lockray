import { describe, it, expect } from "vitest";
import { diffCapabilities } from "./diff.js";
import type { PackageCapabilities } from "./file-capabilities.js";
import type { Capability } from "./capability-shape.js";

function cap(
  overrides: Partial<Capability> = {},
): Capability {
  return {
    matcher: "fetch",
    rule: "NEW_NETWORK_CALL",
    filePath: "x.js",
    snippet: "fetch(...)",
    ...overrides,
  };
}

function caps(install: Capability[] = [], runtime: Capability[] = []): PackageCapabilities {
  return {
    install,
    runtime,
    coverage: {
      totalFiles: 0,
      parsed: 0,
      skipped: {
        "unsupported-extension": 0,
        "too-large": 0,
        "minified-or-bundled": 0,
        "non-runtime-path": 0,
      },
      errors: 0,
      unresolvedScriptTargets: 0,
    },
  };
}

describe("diffCapabilities", () => {
  it("emits a diff when a capability is new in after.runtime", () => {
    const before = caps();
    const after = caps([], [cap({ matcher: "fetch" })]);
    const out = diffCapabilities(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]?.matcher).toBe("fetch");
    expect(out[0]?.bucket).toBe("runtime");
    expect(out[0]?.beforePresent).toBe(false);
    expect(out[0]?.afterPresent).toBe(true);
  });

  it("emits no diff when capability is present in both before and after", () => {
    const before = caps([], [cap({ matcher: "fetch", filePath: "a.js" })]);
    const after = caps([], [cap({ matcher: "fetch", filePath: "b.js" })]);
    const out = diffCapabilities(before, after);
    expect(out).toEqual([]);
  });

  it("emits no diff when capability disappears in after (removal, not new)", () => {
    const before = caps([], [cap({ matcher: "fetch" })]);
    const after = caps();
    const out = diffCapabilities(before, after);
    expect(out).toEqual([]);
  });

  it("fires bucket: install when a capability is new in install even if it was present in before.runtime", () => {
    const before = caps([], [cap({ matcher: "http.request" })]);
    const after = caps([cap({ matcher: "http.request", filePath: "scripts/p.js" })], [cap({ matcher: "http.request", filePath: "lib/a.js" })]);
    const out = diffCapabilities(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]?.bucket).toBe("install");
    expect(out[0]?.matcher).toBe("http.request");
  });

  it("emits two diffs when a capability is new in BOTH install and runtime", () => {
    const before = caps();
    const after = caps(
      [cap({ matcher: "fetch", filePath: "scripts/p.js" })],
      [cap({ matcher: "fetch", filePath: "lib/a.js" })],
    );
    const out = diffCapabilities(before, after);
    expect(out).toHaveLength(2);
    const buckets = out.map((d) => d.bucket).sort();
    expect(buckets).toEqual(["install", "runtime"]);
  });

  it("capability new in a file that didn't exist in before fires (new-file case)", () => {
    const before = caps();
    const after = caps([], [cap({ matcher: "fetch", filePath: "totally-new/file.js" })]);
    const out = diffCapabilities(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]?.afterFiles).toEqual(["totally-new/file.js"]);
  });
});
