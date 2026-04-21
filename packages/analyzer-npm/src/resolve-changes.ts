import { basename, relative } from "node:path";
import type { DependencyChange, GitShowFn, ProjectInput } from "@lockray/types";
import { parsePackageLock } from "./parsers/package-lock.js";
import { parsePnpmLock } from "./parsers/pnpm-lock.js";
import { parsePackageJson } from "./parsers/package-json.js";
import type { NpmLockfile, NpmLockEntry } from "./parsers/types.js";

const EMPTY_LOCKFILE: NpmLockfile = {
  format: "package-lock-v3",
  lockfileVersionRaw: "0",
  entries: new Map(),
};

function parseLockfile(path: string, content: string): NpmLockfile {
  const name = basename(path);
  if (name === "pnpm-lock.yaml") return parsePnpmLock(content);
  return parsePackageLock(content);
}

function toRelative(projectRoot: string, absPath: string): string {
  if (absPath.startsWith("/")) {
    return relative(projectRoot, absPath) || absPath;
  }
  return absPath;
}

export async function resolveNpmChanges(
  project: ProjectInput,
  base: string,
  head: string,
  gitShow: GitShowFn,
): Promise<DependencyChange[]> {
  const lockRel = toRelative(project.rootPath, project.lockfilePath);
  const manifestRel = toRelative(
    project.rootPath,
    project.manifestPaths[0] ?? "package.json",
  );

  const [baseLockRaw, headLockRaw, baseManifestRaw, headManifestRaw] =
    await Promise.all([
      gitShow(base, lockRel),
      gitShow(head, lockRel),
      gitShow(base, manifestRel),
      gitShow(head, manifestRel),
    ]);

  const baseLock: NpmLockfile = baseLockRaw !== null
    ? parseLockfile(lockRel, baseLockRaw)
    : EMPTY_LOCKFILE;
  const headLock: NpmLockfile = headLockRaw !== null
    ? parseLockfile(lockRel, headLockRaw)
    : EMPTY_LOCKFILE;

  const headDirect = headManifestRaw
    ? parsePackageJson(headManifestRaw).directDeps
    : new Set<string>();
  const baseDirect = baseManifestRaw
    ? parsePackageJson(baseManifestRaw).directDeps
    : new Set<string>();
  const directNames = new Set<string>([...headDirect, ...baseDirect]);

  const allNames = new Set<string>([
    ...baseLock.entries.keys(),
    ...headLock.entries.keys(),
  ]);
  const changes: DependencyChange[] = [];

  for (const name of allNames) {
    const before: NpmLockEntry | undefined = baseLock.entries.get(name);
    const after: NpmLockEntry | undefined = headLock.entries.get(name);

    const fromVersion = before?.version ?? null;
    const toVersion = after?.version ?? null;
    const integrityChanged =
      !!before &&
      !!after &&
      before.version === after.version &&
      before.integrity !== after.integrity;
    const sourceChanged =
      !!before &&
      !!after &&
      before.version === after.version &&
      !!before.resolved &&
      !!after.resolved &&
      before.resolved !== after.resolved;

    const isNoOp =
      fromVersion === toVersion && !integrityChanged && !sourceChanged;
    if (isNoOp) continue;

    changes.push({
      ecosystem: "npm",
      name,
      fromVersion,
      toVersion,
      direct: directNames.has(name),
      manifestPath: manifestRel,
      workspaceName: project.workspaceName,
      integrityChanged,
      sourceChanged,
    });
  }

  return changes;
}
