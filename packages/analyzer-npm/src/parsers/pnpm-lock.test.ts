import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePnpmLock } from "./pnpm-lock.js";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/pnpm-lock");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

describe("parsePnpmLock", () => {
  it("parses lockfileVersion 9.0 with two deps", () => {
    const lock = parsePnpmLock(loadFixture("v9-simple-before.yaml"));
    expect(lock.format).toBe("pnpm-lock-v9");
    expect(lock.lockfileVersionRaw).toBe("9.0");
    expect(lock.entries.size).toBe(2);
    const lodash = lock.entries.get("lodash");
    expect(lodash?.version).toBe("4.17.20");
    expect(lodash?.integrity).toMatch(/^sha512-/);
  });

  it("splits scoped package keys correctly", () => {
    const raw = [
      "lockfileVersion: '9.0'",
      "packages:",
      "  '@scope/pkg@2.0.0':",
      "    resolution:",
      "      integrity: sha512-abc",
      "",
    ].join("\n");
    const lock = parsePnpmLock(raw);
    expect(lock.entries.get("@scope/pkg")?.version).toBe("2.0.0");
  });

  it("strips peer-dep suffix from version when present", () => {
    const raw = [
      "lockfileVersion: '9.0'",
      "packages:",
      "  foo@1.0.0(peer@2.0.0):",
      "    resolution:",
      "      integrity: sha512-xyz",
      "",
    ].join("\n");
    const lock = parsePnpmLock(raw);
    expect(lock.entries.get("foo")?.version).toBe("1.0.0");
  });

  it("throws LockfileParseError on invalid YAML", () => {
    expect(() => parsePnpmLock(": : :\n")).toThrow(/invalid yaml/i);
  });

  it("throws LockfileParseError on unsupported lockfileVersion", () => {
    expect(() =>
      parsePnpmLock("lockfileVersion: '5.4'\npackages: {}\n"),
    ).toThrow(/unsupported/i);
  });

  it("handles npm alias syntax (foo@npm:bar@1.0.0)", () => {
    const raw = [
      "lockfileVersion: '9.0'",
      "packages:",
      "  'foo@npm:bar@1.0.0':",
      "    resolution:",
      "      integrity: sha512-aliased",
      "",
    ].join("\n");
    const lock = parsePnpmLock(raw);
    const entry = lock.entries.get("foo");
    expect(entry).toBeDefined();
    expect(entry?.version).toBe("npm:bar@1.0.0");
  });

  it("skips workspace link entries (file:/link:)", () => {
    const raw = [
      "lockfileVersion: '9.0'",
      "packages:",
      "  'file:../local-pkg':",
      "    resolution:",
      "      directory: ../local-pkg",
      "      type: directory",
      "  'link:../other-pkg':",
      "    resolution:",
      "      directory: ../other-pkg",
      "      type: directory",
      "  lodash@4.17.20:",
      "    resolution:",
      "      integrity: sha512-real",
      "",
    ].join("\n");
    const lock = parsePnpmLock(raw);
    expect(lock.entries.size).toBe(1);
    expect(lock.entries.get("lodash")?.version).toBe("4.17.20");
    expect(lock.entries.has("file:../local-pkg")).toBe(false);
  });
});
