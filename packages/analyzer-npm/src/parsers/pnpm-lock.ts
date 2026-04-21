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

/**
 * Parses a pnpm v9 packages-map key into name+version.
 *
 * Handles:
 *   - Plain:           lodash@4.17.20
 *   - Scoped:          @scope/pkg@2.0.0
 *   - Peer suffix:     foo@1.0.0(peer@2.0.0)
 *   - npm alias:       foo@npm:bar@1.0.0 → {name:"foo", version:"npm:bar@1.0.0"}
 *
 * Intentionally skips (returns null):
 *   - Workspace links: file:../local-pkg, link:../local-pkg
 *     These have no meaningful version for integrity/CVE analysis and
 *     don't participate in the change-detection pipeline in M1.
 */
function splitPnpmKey(key: string): { name: string; version: string } | null {
  // Skip workspace link entries — no version to track.
  if (key.startsWith("file:") || key.startsWith("link:")) return null;

  // Strip any peer-dependency suffix before locating the name/version separator.
  const stripped = key.includes("(") ? key.slice(0, key.indexOf("(")) : key;

  // npm alias syntax: `foo@npm:bar@1.0.0` — the FIRST `@` is the real separator.
  // Scoped + alias: `@scope/foo@npm:bar@1.0.0` — the SECOND `@` is the separator.
  if (stripped.includes("@npm:")) {
    // Find the `@` immediately preceding `npm:`.
    const aliasMarker = stripped.indexOf("@npm:");
    if (aliasMarker <= 0) return null;
    const name = stripped.slice(0, aliasMarker);
    const version = stripped.slice(aliasMarker + 1);
    if (!name || !version) return null;
    return { name, version };
  }

  // Non-alias: last `@` is the separator (skips the scope `@` for scoped names).
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
      "INVALID_YAML",
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
