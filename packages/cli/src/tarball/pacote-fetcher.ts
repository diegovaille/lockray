import { mkdtemp, rm, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import pacote from "pacote";
import type { Ecosystem, FetchedPackage, TarballFetcher } from "@lockray/types";

/**
 * Real TarballFetcher that uses pacote to download+extract the tarball
 * into a scratch directory, then reads the root package.json back.
 *
 * After extraction, every allowlisted-extension file whose size is
 * ≤ MAX_FILE_BYTES is loaded into FetchedPackage.sourceFiles. Files
 * above the cap are silently skipped — no fetch-time error; the
 * coverage planner and AST analysis simply never see them.
 *
 * The scratch directory is cleaned up unconditionally so CI runners do
 * not accumulate artifacts across many invocations.
 */

const ALLOWED_EXTENSIONS: readonly string[] = [
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
];

const MAX_FILE_BYTES = 500_000;

/** Recursively list every regular file under `root`, returning POSIX-relative paths. */
async function listFiles(root: string, dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listFiles(root, full)));
    } else if (e.isFile()) {
      const rel = relative(root, full).split(sep).join("/");
      out.push(rel);
    }
  }
  return out;
}

function hasAllowedExtension(path: string): boolean {
  for (const ext of ALLOWED_EXTENSIONS) {
    if (path.endsWith(ext)) return true;
  }
  return false;
}

/** Load a single file if it fits under the cap. Returns null to skip. */
async function loadFileIfEligible(fullPath: string): Promise<string | null> {
  const s = await stat(fullPath);
  if (!s.isFile()) return null;
  if (s.size > MAX_FILE_BYTES) return null;
  return await readFile(fullPath, "utf8");
}

export function createPacoteFetcher(): TarballFetcher {
  return async (ecosystem: Ecosystem, name: string, version: string): Promise<FetchedPackage> => {
    if (ecosystem !== "npm") {
      throw new Error(`pacote fetcher does not support ecosystem ${ecosystem}`);
    }
    const dir = await mkdtemp(join(tmpdir(), "lockray-tarball-"));
    try {
      await pacote.extract(`${name}@${version}`, dir);

      // Load the manifest.
      const manifest = JSON.parse(
        await readFile(join(dir, "package.json"), "utf8"),
      ) as Record<string, unknown>;

      // Load source files (allowlisted extension, ≤ MAX_FILE_BYTES).
      const rels = await listFiles(dir, dir);
      const sourceFiles = new Map<string, string>();
      for (const rel of rels) {
        if (!hasAllowedExtension(rel)) continue;
        const content = await loadFileIfEligible(join(dir, rel));
        if (content === null) continue;
        sourceFiles.set(rel, content);
      }

      return {
        ecosystem,
        name,
        version,
        integrity: null,
        packageJson: manifest,
        sourceFiles,
      } satisfies FetchedPackage;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
