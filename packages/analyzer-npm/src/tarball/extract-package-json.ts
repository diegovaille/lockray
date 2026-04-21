import { TarballFetchError } from "../errors.js";

/**
 * Given the file map of a decompressed npm tarball (keys are archive
 * paths, values are file contents), return the root package.json as
 * a parsed object. npm tarballs conventionally place the package under
 * a leading `package/` directory.
 */
export function extractRootPackageJson(
  files: Map<string, string>,
): Record<string, unknown> {
  const candidates = ["package/package.json", "package.json"];
  let raw: string | undefined;
  for (const candidate of candidates) {
    const found = files.get(candidate);
    if (found !== undefined) {
      raw = found;
      break;
    }
  }
  if (raw === undefined) {
    throw new TarballFetchError(
      "tarball root package.json not found",
      "INVALID_ARCHIVE",
    );
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new TarballFetchError(
      `invalid JSON in tarball package.json: ${(err as Error).message}`,
      "INVALID_ARCHIVE",
    );
  }
}
