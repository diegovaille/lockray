import type { Capability } from "./capability-shape.js";
import type { PackageCapabilities } from "./file-capabilities.js";

export interface CapabilityDiff {
  matcher: string;
  rule: Capability["rule"];
  bucket: "install" | "runtime";
  beforePresent: boolean;
  afterPresent: boolean;
  /** Distinct POSIX paths in after where this (matcher, bucket) capability appears. */
  afterFiles: string[];
  /** Snippet from the first capability contributing to afterFiles. */
  sampleSnippet: string;
}

function indexByMatcher(caps: readonly Capability[]): Map<string, Capability[]> {
  const out = new Map<string, Capability[]>();
  for (const c of caps) {
    const arr = out.get(c.matcher) ?? [];
    arr.push(c);
    out.set(c.matcher, arr);
  }
  return out;
}

function distinctFiles(caps: readonly Capability[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of caps) {
    if (!seen.has(c.filePath)) {
      seen.add(c.filePath);
      out.push(c.filePath);
    }
  }
  return out;
}

function diffOneBucket(
  bucket: "install" | "runtime",
  before: readonly Capability[],
  after: readonly Capability[],
): CapabilityDiff[] {
  const beforeIdx = indexByMatcher(before);
  const afterIdx = indexByMatcher(after);
  const out: CapabilityDiff[] = [];
  for (const [matcher, afterCaps] of afterIdx.entries()) {
    const beforePresent = beforeIdx.has(matcher);
    if (beforePresent) continue; // not new in this bucket
    const files = distinctFiles(afterCaps);
    out.push({
      matcher,
      rule: afterCaps[0]!.rule,
      bucket,
      beforePresent: false,
      afterPresent: true,
      afterFiles: files,
      sampleSnippet: afterCaps[0]!.snippet,
    });
  }
  return out;
}

export function diffCapabilities(
  before: PackageCapabilities,
  after: PackageCapabilities,
): CapabilityDiff[] {
  return [
    ...diffOneBucket("install", before.install, after.install),
    ...diffOneBucket("runtime", before.runtime, after.runtime),
  ];
}
