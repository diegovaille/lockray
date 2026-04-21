import { z } from "zod";
import { LockfileParseError } from "./package-lock.js";

const ManifestSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
    peerDependencies: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export interface ParsedManifest {
  name: string | null;
  version: string | null;
  directDeps: Set<string>;
}

export function parsePackageJson(raw: string): ParsedManifest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new LockfileParseError(
      `Invalid JSON in package.json: ${(err as Error).message}`,
      "INVALID_JSON",
    );
  }

  const parsed = ManifestSchema.safeParse(data);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new LockfileParseError(
      `Schema mismatch in package.json: ${details}`,
      "SCHEMA_MISMATCH",
    );
  }

  const deps = new Set<string>();
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const) {
    const map = parsed.data[field];
    if (!map) continue;
    for (const name of Object.keys(map)) deps.add(name);
  }

  return {
    name: parsed.data.name ?? null,
    version: parsed.data.version ?? null,
    directDeps: deps,
  };
}
