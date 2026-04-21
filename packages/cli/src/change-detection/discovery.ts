import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { glob } from "glob";
import type { ProjectInput } from "@lockray/types";

const NPM_LOCKFILE_PRECEDENCE = ["pnpm-lock.yaml", "package-lock.json"] as const;

interface RootManifest {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
}

function readRootManifest(rootPath: string): RootManifest | null {
  const pkgPath = join(rootPath, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")) as RootManifest;
  } catch {
    return null;
  }
}

function extractWorkspacePatterns(manifest: RootManifest): string[] {
  if (Array.isArray(manifest.workspaces)) return manifest.workspaces;
  if (manifest.workspaces && Array.isArray(manifest.workspaces.packages)) {
    return manifest.workspaces.packages;
  }
  return [];
}

function pickLockfile(dir: string): string | null {
  for (const name of NPM_LOCKFILE_PRECEDENCE) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function buildProject(
  _rootPath: string,
  workspacePath: string,
  workspaceName: string,
  lockfilePath: string | null,
): ProjectInput {
  const manifestPath = join(workspacePath, "package.json");
  return {
    workspaceName,
    rootPath: workspacePath,
    ecosystem: "npm",
    manifestPaths: [manifestPath],
    lockfilePath: lockfilePath ?? "",
    parseOutcome: lockfilePath ? "fully-supported" : "missing",
  };
}

export async function discoverProjects(rootPath: string): Promise<ProjectInput[]> {
  const manifest = readRootManifest(rootPath);
  if (!manifest) return [];

  const rootLockfile = pickLockfile(rootPath);
  const patterns = extractWorkspacePatterns(manifest);

  if (patterns.length === 0) {
    return [buildProject(rootPath, rootPath, "root", rootLockfile)];
  }

  const results: ProjectInput[] = [buildProject(rootPath, rootPath, "root", rootLockfile)];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: rootPath,
      absolute: true,
    });
    for (const wsPath of matches) {
      const wsManifestPath = join(wsPath, "package.json");
      if (!existsSync(wsManifestPath)) continue;
      const wsLockfile = pickLockfile(wsPath);
      const rel = relative(rootPath, wsPath);
      // Sub-workspaces get only their own lockfile in M1. Inheriting the
      // root lockfile would mix absolute paths across workspace roots and
      // break git-show-based change detection (Task 9). When monorepos
      // with a single shared root lockfile are supported, revisit by adding
      // gitRootPath to ProjectInput.
      results.push(buildProject(rootPath, wsPath, rel, wsLockfile));
    }
  }
  return results;
}
