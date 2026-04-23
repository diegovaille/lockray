import type { Severity, Verdict } from "@lockray/types";

/**
 * Per-severity weight contribution (before confidence / location / diminishing).
 * Values from spec §9 — critical heavy enough that one critical finding with
 * confidence >= 0.6 lands in the block band on its own.
 */
export const DEFAULT_SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 75,
  high: 30,
  medium: 12,
  low: 4,
  info: 0,
};

/**
 * Multiplier applied to a finding's contribution based on whether the
 * package is a direct or transitive dependency. Transitive-escalated
 * (escalated=true on the Finding) reverts to the direct multiplier
 * because escalation already evidences a high-confidence signal.
 */
export const DEFAULT_LOCATION_MULTIPLIERS = {
  direct: 1.0,
  transitive: 0.6,
  transitiveEscalated: 1.0,
} as const;

/**
 * Diminishing-returns curve for repeated findings of the same code in
 * the same package. First occurrence counts at 1.0; second at 0.6; third
 * and beyond at 0.3 (floor). Prevents spammy rule output (e.g. 8 regex
 * hits in one file) from dominating a package's score.
 */
export function DEFAULT_DIMINISHING(occurrenceIndex: number): number {
  if (occurrenceIndex <= 0) return 1.0;
  if (occurrenceIndex === 1) return 0.6;
  return 0.3;
}

/**
 * Verdict thresholds (inclusive lower bound for each band):
 *   0-29    → safe
 *   30-59   → review
 *   60-100  → block
 */
export interface Thresholds {
  /** Minimum score for the `review` band. */
  review: number;
  /** Minimum score for the `block` band. */
  block: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  review: 30,
  block: 60,
};

/**
 * Compound-bonus table. When a package has findings whose `code` values
 * are a superset of a bonus's `codes` array, the bonus is added to the
 * package's raw score (capped at 100 overall). Taken verbatim from spec §8.
 */
export interface CompoundBonus {
  codes: readonly [string, string, ...string[]];
  bonus: number;
}

export const DEFAULT_COMPOUND_BONUSES: readonly CompoundBonus[] = [
  { codes: ["NEW_NETWORK_CALL", "NEW_CREDENTIAL_ACCESS"], bonus: 20 },
  { codes: ["NEW_POSTINSTALL_SCRIPT", "OBFUSCATED_CODE"], bonus: 25 },
  { codes: ["MAINTAINER_CHANGED", "NEW_NETWORK_CALL"], bonus: 15 },
];

/**
 * Resolve a numeric score to a Verdict per the supplied thresholds.
 * Uses DEFAULT_THRESHOLDS when no override is given. Shared helper so
 * package-level and PR-level verdict selection stay consistent.
 */
export function verdictFor(
  score: number,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Verdict {
  if (score >= thresholds.block) return "block";
  if (score >= thresholds.review) return "review";
  return "safe";
}
