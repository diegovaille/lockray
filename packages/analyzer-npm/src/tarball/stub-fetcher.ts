import type { FetchedPackage, TarballFetcher } from "@lockray/types";
import { TarballFetchError } from "../errors.js";

function key(eco: string, name: string, version: string): string {
  return `${eco}:${name}@${version}`;
}

/**
 * Build a `TarballFetcher` backed by a fixed registry. Intended for
 * tests and for the corpus harness — the real pacote-based fetcher
 * lives in `@lockray/cli`.
 */
export function createStubFetcher(
  entries: readonly FetchedPackage[],
): TarballFetcher {
  const registry = new Map<string, FetchedPackage>();
  for (const e of entries) registry.set(key(e.ecosystem, e.name, e.version), e);

  return async (ecosystem, name, version) => {
    const hit = registry.get(key(ecosystem, name, version));
    if (!hit) {
      throw new TarballFetchError(
        `tarball not found in stub registry: ${name}@${version}`,
        "NOT_FOUND",
      );
    }
    return hit;
  };
}
