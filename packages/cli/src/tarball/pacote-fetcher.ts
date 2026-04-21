import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pacote from "pacote";
import type { Ecosystem, FetchedPackage, TarballFetcher } from "@lockray/types";

/**
 * Real TarballFetcher that uses pacote to download+extract the tarball
 * into a scratch directory, then reads the root package.json back.
 *
 * The scratch directory is cleaned up unconditionally so CI runners do
 * not accumulate artifacts across many invocations.
 */
export function createPacoteFetcher(): TarballFetcher {
  return async (ecosystem, name, version) => {
    if (ecosystem !== "npm") {
      throw new Error(`pacote fetcher does not support ecosystem ${ecosystem}`);
    }
    const dir = await mkdtemp(join(tmpdir(), "lockray-tarball-"));
    try {
      await pacote.extract(`${name}@${version}`, dir);
      const manifest = JSON.parse(
        await readFile(join(dir, "package.json"), "utf8"),
      ) as Record<string, unknown>;
      return {
        ecosystem,
        name,
        version,
        integrity: null,
        packageJson: manifest,
      } satisfies FetchedPackage;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
