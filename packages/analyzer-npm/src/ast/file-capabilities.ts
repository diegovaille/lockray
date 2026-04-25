import type { Capability } from "./capability-shape.js";
import type { CoveragePlan } from "./coverage.js";
import type { FileParseSkipReason } from "./parser.js";
import { MATCHERS } from "./matchers/index.js";
import { parseFile } from "./parser.js";
import { walk } from "./walker.js";

export interface PackageCapabilities {
  install: Capability[];
  runtime: Capability[];
  coverage: {
    totalFiles: number;
    parsed: number;
    skipped: Record<FileParseSkipReason, number>;
    errors: number;
    unresolvedScriptTargets: number;
  };
}

function emptySkipCounters(): Record<FileParseSkipReason, number> {
  return {
    "unsupported-extension": 0,
    "too-large": 0,
    "minified-or-bundled": 0,
    "non-runtime-path": 0,
  };
}

/**
 * Walk every planned-parse file, run all matchers, bucket the
 * resulting capabilities by the plan's attribution (install vs
 * runtime). Coverage counters include skipped files and parse
 * errors but never crash on malformed input.
 */
export function collectCapabilities(
  sourceFiles: ReadonlyMap<string, string>,
  plan: CoveragePlan,
): PackageCapabilities {
  const install: Capability[] = [];
  const runtime: Capability[] = [];
  const skipped = emptySkipCounters();
  let parsed = 0;
  let errors = 0;

  for (const [path, reason] of plan.skip.entries()) {
    skipped[reason] += 1;
    void path; // silence unused — the entry existence is what we count
  }

  for (const [path, attribution] of plan.parse.entries()) {
    const source = sourceFiles.get(path);
    if (source === undefined) {
      // Shouldn't happen — plan.parse keys come from sourceFiles — but guard.
      errors += 1;
      continue;
    }
    const parseResult = parseFile(source, path);
    if (parseResult.status === "error") {
      errors += 1;
      continue;
    }
    if (parseResult.status === "skipped") {
      // Parser never itself emits skipped today; defensive.
      skipped[parseResult.reason] += 1;
      continue;
    }
    const caps = walk(parseResult.ast, source, path, MATCHERS);
    if (attribution.bucket === "install") install.push(...caps);
    else runtime.push(...caps);
    parsed += 1;
  }

  return {
    install,
    runtime,
    coverage: {
      totalFiles: sourceFiles.size,
      parsed,
      skipped,
      errors,
      unresolvedScriptTargets: plan.unresolvedScriptTargets.length,
    },
  };
}
