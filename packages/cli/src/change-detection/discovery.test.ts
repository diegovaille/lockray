import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProjects } from "./discovery.js";

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

describe("discoverProjects", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "lockray-discover-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns a single ProjectInput for a flat npm repo with package-lock.json", async () => {
    writeJson(join(tmp, "package.json"), { name: "demo", version: "1.0.0" });
    writeJson(join(tmp, "package-lock.json"), {
      name: "demo",
      version: "1.0.0",
      lockfileVersion: 3,
    });

    const projects = await discoverProjects(tmp);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      workspaceName: "root",
      rootPath: tmp,
      ecosystem: "npm",
      parseOutcome: "fully-supported",
    });
    expect(projects[0].lockfilePath).toBe(join(tmp, "package-lock.json"));
    expect(projects[0].manifestPaths).toEqual([join(tmp, "package.json")]);
  });

  it("prefers pnpm-lock.yaml over package-lock.json when both exist", async () => {
    writeJson(join(tmp, "package.json"), { name: "demo", version: "1.0.0" });
    writeJson(join(tmp, "package-lock.json"), { lockfileVersion: 3 });
    writeFileSync(join(tmp, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    const projects = await discoverProjects(tmp);
    expect(projects[0].lockfilePath).toBe(join(tmp, "pnpm-lock.yaml"));
  });

  it("emits missing when manifest exists but no lockfile", async () => {
    writeJson(join(tmp, "package.json"), { name: "demo", version: "1.0.0" });

    const projects = await discoverProjects(tmp);
    expect(projects).toHaveLength(1);
    expect(projects[0].parseOutcome).toBe("missing");
  });

  it("returns one ProjectInput per workspace in a monorepo", async () => {
    writeJson(join(tmp, "package.json"), {
      name: "root",
      private: true,
      workspaces: ["packages/*"],
    });
    writeJson(join(tmp, "package-lock.json"), { lockfileVersion: 3 });
    mkdirSync(join(tmp, "packages/a"), { recursive: true });
    mkdirSync(join(tmp, "packages/b"), { recursive: true });
    writeJson(join(tmp, "packages/a/package.json"), { name: "a", version: "1.0.0" });
    writeJson(join(tmp, "packages/b/package.json"), { name: "b", version: "1.0.0" });

    const projects = await discoverProjects(tmp);
    const names = projects.map((p) => p.workspaceName).sort();
    expect(names).toEqual(["packages/a", "packages/b", "root"]);
  });

  it("sub-workspaces without their own lockfile emit missing (no root-lockfile inheritance in M1)", async () => {
    writeJson(join(tmp, "package.json"), {
      name: "root",
      private: true,
      workspaces: ["packages/*"],
    });
    writeJson(join(tmp, "package-lock.json"), { lockfileVersion: 3 });
    mkdirSync(join(tmp, "packages/a"), { recursive: true });
    writeJson(join(tmp, "packages/a/package.json"), { name: "a", version: "1.0.0" });

    const projects = await discoverProjects(tmp);
    const sub = projects.find((p) => p.workspaceName === "packages/a");
    expect(sub).toBeDefined();
    expect(sub?.parseOutcome).toBe("missing");
    expect(sub?.lockfilePath).toBe("");
  });

  it("returns empty array when repo has no npm manifests", async () => {
    writeFileSync(join(tmp, "README.md"), "# empty");
    const projects = await discoverProjects(tmp);
    expect(projects).toEqual([]);
  });
});
