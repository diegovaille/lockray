import type { Finding } from "@lockray/types";
import {
  DEFAULT_DIMINISHING,
  DEFAULT_LOCATION_MULTIPLIERS,
  DEFAULT_SEVERITY_WEIGHTS,
} from "./weights.js";

function clampUnit(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function locationMultiplier(f: Finding): number {
  if (f.direct) return DEFAULT_LOCATION_MULTIPLIERS.direct;
  if (f.escalated) return DEFAULT_LOCATION_MULTIPLIERS.transitiveEscalated;
  return DEFAULT_LOCATION_MULTIPLIERS.transitive;
}

/**
 * Compute the score contribution of a single finding, given its
 * 0-indexed occurrence within its package for the same `code`.
 *
 * contribution = severity_weight × confidence × location × diminishing
 *
 * Info severity always returns 0. Confidence is clamped to [0, 1].
 */
export function contributionFor(finding: Finding, occurrenceIndex: number): number {
  const weight = DEFAULT_SEVERITY_WEIGHTS[finding.severity] ?? 0;
  if (weight === 0) return 0;
  const conf = clampUnit(finding.confidence);
  const loc = locationMultiplier(finding);
  const dim = DEFAULT_DIMINISHING(occurrenceIndex);
  return weight * conf * loc * dim;
}
