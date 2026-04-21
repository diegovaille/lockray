import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePackageLock } from "./package-lock.js";

const FIXTURE_DIR = join(
  process.cwd(),
  "tests/fixtures/package-lock",
);

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

describe("parsePackageLock", () => {
  it("parses lockfileVersion 3 with root + two deps", () => {
    const lock = parsePackageLock(loadFixture("v3-simple-before.json"));
    expect(lock.format).toBe("package-lock-v3");
    expect(lock.lockfileVersionRaw).toBe("3");
    expect(lock.entries.size).toBe(2);

    const lodash = lock.entries.get("lodash");
    expect(lodash).toBeDefined();
    expect(lodash?.version).toBe("4.17.20");
    expect(lodash?.integrity).toMatch(/^sha512-/);
    expect(lodash?.resolved).toBe("https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz");
    expect(lodash?.isRoot).toBe(false);
  });

  it("skips the root '' entry", () => {
    const lock = parsePackageLock(loadFixture("v3-simple-before.json"));
    expect(lock.entries.has("")).toBe(false);
    expect(lock.entries.has("demo")).toBe(false);
  });

  it("handles scoped package names correctly", () => {
    const raw = JSON.stringify({
      name: "scoped-demo",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "scoped-demo", version: "1.0.0" },
        "node_modules/@scope/pkg": {
          version: "2.0.0",
          resolved: "https://registry.npmjs.org/@scope/pkg/-/pkg-2.0.0.tgz",
          integrity: "sha512-abc",
        },
      },
    });
    const lock = parsePackageLock(raw);
    expect(lock.entries.get("@scope/pkg")?.version).toBe("2.0.0");
  });

  it("throws LockfileParseError on invalid JSON", () => {
    expect(() => parsePackageLock("{ not json")).toThrow(/invalid json/i);
  });

  it("throws LockfileParseError on unsupported lockfileVersion", () => {
    const raw = JSON.stringify({ lockfileVersion: 1, packages: {} });
    expect(() => parsePackageLock(raw)).toThrow(/unsupported/i);
  });

  it("accepts lockfileVersion 2 and tags format as package-lock-v2", () => {
    const raw = JSON.stringify({
      name: "demo",
      version: "1.0.0",
      lockfileVersion: 2,
      packages: {
        "": { name: "demo", version: "1.0.0" },
        "node_modules/ms": {
          version: "2.1.3",
          resolved: "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
          integrity: "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/s4VwWp4sMyoAukX7c54PP6jmQKhw==",
        },
      },
    });
    const lock = parsePackageLock(raw);
    expect(lock.format).toBe("package-lock-v2");
    expect(lock.lockfileVersionRaw).toBe("2");
    expect(lock.entries.get("ms")?.version).toBe("2.1.3");
  });
});
