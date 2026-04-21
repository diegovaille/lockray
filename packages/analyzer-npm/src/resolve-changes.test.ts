import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveNpmChanges } from "./resolve-changes.js";
import type { ProjectInput, GitShowFn } from "@lockray/types";

const FIX = join(process.cwd(), "tests/fixtures/package-lock");

function baseProject(): ProjectInput {
  return {
    workspaceName: "root",
    rootPath: "/irrelevant",
    ecosystem: "npm",
    manifestPaths: ["package.json"],
    lockfilePath: "package-lock.json",
    parseOutcome: "fully-supported",
  };
}

function stubGitShow(fileContents: Map<string, string>): GitShowFn {
  return async (ref, path) => fileContents.get(`${ref}:${path}`) ?? null;
}

describe("resolveNpmChanges", () => {
  it("detects version bumps for direct deps", async () => {
    const before = readFileSync(join(FIX, "v3-simple-before.json"), "utf8");
    const after = readFileSync(join(FIX, "v3-simple-after.json"), "utf8");
    const manifest = JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dependencies: { lodash: "^4", chalk: "^5" },
    });

    const gitShow = stubGitShow(
      new Map([
        ["base:package-lock.json", before],
        ["head:package-lock.json", after],
        ["base:package.json", manifest],
        ["head:package.json", manifest],
      ]),
    );

    const changes = await resolveNpmChanges(baseProject(), "base", "head", gitShow);
    expect(changes).toHaveLength(2);
    const lodash = changes.find((c) => c.name === "lodash");
    expect(lodash).toMatchObject({
      name: "lodash",
      fromVersion: "4.17.20",
      toVersion: "4.17.21",
      direct: true,
      integrityChanged: false,
      sourceChanged: false,
    });
  });

  it("flags integrityChanged when hash changes without version change", async () => {
    const before = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "demo", version: "1.0.0", dependencies: { a: "^1" } },
        "node_modules/a": {
          version: "1.0.0",
          resolved: "https://registry.npmjs.org/a/-/a-1.0.0.tgz",
          integrity: "sha512-original",
        },
      },
    });
    const after = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "demo", version: "1.0.0", dependencies: { a: "^1" } },
        "node_modules/a": {
          version: "1.0.0",
          resolved: "https://registry.npmjs.org/a/-/a-1.0.0.tgz",
          integrity: "sha512-TAMPERED",
        },
      },
    });
    const manifest = JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dependencies: { a: "^1" },
    });

    const gitShow = stubGitShow(
      new Map([
        ["base:package-lock.json", before],
        ["head:package-lock.json", after],
        ["base:package.json", manifest],
        ["head:package.json", manifest],
      ]),
    );

    const changes = await resolveNpmChanges(baseProject(), "base", "head", gitShow);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      name: "a",
      fromVersion: "1.0.0",
      toVersion: "1.0.0",
      integrityChanged: true,
    });
  });

  it("emits fromVersion=null for added packages", async () => {
    const before = JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "demo", version: "1.0.0" } },
    });
    const after = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "demo", version: "1.0.0", dependencies: { newdep: "^1" } },
        "node_modules/newdep": {
          version: "1.0.0",
          resolved: "https://registry.npmjs.org/newdep/-/newdep-1.0.0.tgz",
          integrity: "sha512-abc",
        },
      },
    });
    const manifestBefore = JSON.stringify({ name: "demo", version: "1.0.0" });
    const manifestAfter = JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dependencies: { newdep: "^1" },
    });

    const gitShow = stubGitShow(
      new Map([
        ["base:package-lock.json", before],
        ["head:package-lock.json", after],
        ["base:package.json", manifestBefore],
        ["head:package.json", manifestAfter],
      ]),
    );

    const changes = await resolveNpmChanges(baseProject(), "base", "head", gitShow);
    expect(changes).toEqual([
      expect.objectContaining({
        name: "newdep",
        fromVersion: null,
        toVersion: "1.0.0",
        direct: true,
      }),
    ]);
  });

  it("emits toVersion=null for removed packages", async () => {
    const before = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "demo", version: "1.0.0", dependencies: { old: "^1" } },
        "node_modules/old": {
          version: "1.0.0",
          integrity: "sha512-abc",
        },
      },
    });
    const after = JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "demo", version: "1.0.0" } },
    });
    const manifest = JSON.stringify({ name: "demo", version: "1.0.0" });

    const gitShow = stubGitShow(
      new Map([
        ["base:package-lock.json", before],
        ["head:package-lock.json", after],
        ["base:package.json", manifest],
        ["head:package.json", manifest],
      ]),
    );

    const changes = await resolveNpmChanges(baseProject(), "base", "head", gitShow);
    expect(changes).toEqual([
      expect.objectContaining({
        name: "old",
        fromVersion: "1.0.0",
        toVersion: null,
      }),
    ]);
  });

  it("flags sourceChanged when resolved URL changes without version change", async () => {
    const makeLockfile = (url: string) =>
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "demo", version: "1.0.0", dependencies: { pkg: "^1" } },
          "node_modules/pkg": {
            version: "1.0.0",
            resolved: url,
            integrity: "sha512-abc",
          },
        },
      });
    const before = makeLockfile("https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz");
    const after = makeLockfile("https://my-mirror.internal/pkg/-/pkg-1.0.0.tgz");
    const manifest = JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dependencies: { pkg: "^1" },
    });

    const gitShow = stubGitShow(
      new Map([
        ["base:package-lock.json", before],
        ["head:package-lock.json", after],
        ["base:package.json", manifest],
        ["head:package.json", manifest],
      ]),
    );

    const changes = await resolveNpmChanges(baseProject(), "base", "head", gitShow);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      name: "pkg",
      fromVersion: "1.0.0",
      toVersion: "1.0.0",
      integrityChanged: false,
      sourceChanged: true,
    });
  });

  it("returns empty array when lockfile content is identical", async () => {
    const same = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "demo", version: "1.0.0" },
        "node_modules/x": { version: "1.0.0", integrity: "sha512-abc" },
      },
    });
    const manifest = JSON.stringify({ name: "demo", version: "1.0.0" });

    const gitShow = stubGitShow(
      new Map([
        ["base:package-lock.json", same],
        ["head:package-lock.json", same],
        ["base:package.json", manifest],
        ["head:package.json", manifest],
      ]),
    );

    const changes = await resolveNpmChanges(baseProject(), "base", "head", gitShow);
    expect(changes).toEqual([]);
  });
});
