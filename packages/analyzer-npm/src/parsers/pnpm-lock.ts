import yaml from "js-yaml";
import { z } from "zod";
import type { NpmLockEntry, NpmLockfile } from "./types.js";
import { LockfileParseError } from "./package-lock.js";

const PnpmPackageSchema = z
  .object({
    resolution: z
      .object({
        integrity: z.string().optional(),
        tarball: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const PnpmLockSchema = z
  .object({
    lockfileVersion: z.union([z.string(), z.number()]),
    packages: z.record(z.string(), PnpmPackageSchema).optional(),
  })
  .passthrough();

function splitPnpmKey(key: string): { name: string; version: string } | null {
  // Strip peer-dep suffix before splitting: "foo@1.0.0(peer@2.0.0)" → "foo@1.0.0"
  const stripped = key.includes("(") ? key.slice(0, key.indexOf("(")) : key;
  const at = stripped.lastIndexOf("@");
  if (at <= 0) return null;
  const name = stripped.slice(0, at);
  const version = stripped.slice(at + 1);
  if (!name || !version) return null;
  return { name, version };
}

export function parsePnpmLock(raw: string): NpmLockfile {
  let data: unknown;
  try {
    data = yaml.load(raw);
  } catch (err) {
    throw new LockfileParseError(
      `Invalid YAML in pnpm-lock.yaml: ${(err as Error).message}`,
      "INVALID_JSON",
    );
  }

  const parsed = PnpmLockSchema.safeParse(data);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new LockfileParseError(
      `Schema mismatch in pnpm-lock.yaml: ${details}`,
      "SCHEMA_MISMATCH",
    );
  }

  const versionStr = String(parsed.data.lockfileVersion);
  const major = Number.parseFloat(versionStr);
  if (Number.isNaN(major) || major < 9) {
    throw new LockfileParseError(
      `Unsupported pnpm lockfileVersion ${versionStr}; LockRay v1.0 requires 9.0+`,
      "UNSUPPORTED_VERSION",
    );
  }

  const entries = new Map<string, NpmLockEntry>();
  for (const [key, pkg] of Object.entries(parsed.data.packages ?? {})) {
    const split = splitPnpmKey(key);
    if (!split) continue;
    // TODO(M6): Same-name multi-version entries overwrite silently; see the
    // matching note in package-lock.ts. Deferred to M6.
    entries.set(split.name, {
      name: split.name,
      version: split.version,
      integrity: pkg.resolution?.integrity ?? null,
      resolved: pkg.resolution?.tarball ?? null,
      isRoot: false,
    });
  }

  return {
    format: "pnpm-lock-v9",
    lockfileVersionRaw: versionStr,
    entries,
  };
}
