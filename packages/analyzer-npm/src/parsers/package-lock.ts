import { z } from "zod";
import type { NpmLockEntry, NpmLockfile } from "./types.js";

const PackageEntrySchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    resolved: z.string().optional(),
    integrity: z.string().optional(),
  })
  .passthrough();

const PackageLockSchema = z
  .object({
    lockfileVersion: z.number(),
    packages: z.record(z.string(), PackageEntrySchema),
  })
  .passthrough();

export class LockfileParseError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_JSON" | "UNSUPPORTED_VERSION" | "SCHEMA_MISMATCH",
  ) {
    super(message);
    this.name = "LockfileParseError";
  }
}

function nameFromPath(path: string): string | null {
  if (path === "") return null;
  const marker = "node_modules/";
  const idx = path.lastIndexOf(marker);
  if (idx === -1) return null;
  const tail = path.slice(idx + marker.length);
  if (tail.startsWith("@")) {
    const parts = tail.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return tail.split("/")[0] ?? null;
}

export function parsePackageLock(raw: string): NpmLockfile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new LockfileParseError(
      `Invalid JSON in package-lock.json: ${(err as Error).message}`,
      "INVALID_JSON",
    );
  }

  const parsed = PackageLockSchema.safeParse(data);
  if (!parsed.success) {
    throw new LockfileParseError(
      `Schema mismatch in package-lock.json: ${parsed.error.message}`,
      "SCHEMA_MISMATCH",
    );
  }

  if (parsed.data.lockfileVersion < 2) {
    throw new LockfileParseError(
      `Unsupported lockfileVersion ${parsed.data.lockfileVersion}; LockRay v1.0 requires lockfileVersion >= 2 (npm v7+)`,
      "UNSUPPORTED_VERSION",
    );
  }

  const entries = new Map<string, NpmLockEntry>();
  for (const [path, entry] of Object.entries(parsed.data.packages)) {
    const name = nameFromPath(path);
    if (!name) continue;
    if (!entry.version) continue;
    entries.set(name, {
      name,
      version: entry.version,
      integrity: entry.integrity ?? null,
      resolved: entry.resolved ?? null,
      isRoot: false,
    });
  }

  return {
    format: "package-lock-v3",
    lockfileVersionRaw: String(parsed.data.lockfileVersion),
    entries,
  };
}
