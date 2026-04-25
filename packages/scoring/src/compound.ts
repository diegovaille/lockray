import type { Finding } from "@lockray/types";
import { DEFAULT_COMPOUND_BONUSES, type CompoundBonus } from "./weights.js";

/**
 * Bucket-local compound-bonus detector.
 *
 * A bonus applies when every code in the bonus's `codes` tuple is
 * present in the finding set AND all matching findings share a single
 * contextBucket value. Findings with `contextBucket: undefined` count
 * as one shared "legacy" bucket — this preserves pre-M4.2 compound
 * behaviour. Findings in different buckets do NOT combine.
 */
export function compoundBonusFor(findings: readonly Finding[]): number {
  if (findings.length === 0) return 0;

  // Group finding codes by contextBucket.
  const byBucket = new Map<string, Set<string>>();
  for (const f of findings) {
    const key = f.contextBucket ?? "legacy";
    const set = byBucket.get(key) ?? new Set<string>();
    set.add(f.code);
    byBucket.set(key, set);
  }

  let total = 0;
  for (const bonus of DEFAULT_COMPOUND_BONUSES) {
    if (bucketHasAllCodes(byBucket, bonus)) {
      total += bonus.bonus;
    }
  }
  return total;
}

function bucketHasAllCodes(
  byBucket: ReadonlyMap<string, ReadonlySet<string>>,
  bonus: CompoundBonus,
): boolean {
  for (const codes of byBucket.values()) {
    if (bonus.codes.every((c) => codes.has(c))) return true;
  }
  return false;
}
