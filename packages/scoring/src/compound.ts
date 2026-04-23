import type { Finding } from "@lockray/types";
import { DEFAULT_COMPOUND_BONUSES, type CompoundBonus } from "./weights.js";

function matches(codes: Set<string>, bonus: CompoundBonus): boolean {
  for (const required of bonus.codes) {
    if (!codes.has(required)) return false;
  }
  return true;
}

/**
 * Sum of compound-bonus points for a package given its finding list.
 * Each bonus contributes at most once per package even if the same
 * combination could "match multiple times" via repeated findings.
 */
export function compoundBonusFor(findings: readonly Finding[]): number {
  const codes = new Set<string>();
  for (const f of findings) codes.add(f.code);
  let total = 0;
  for (const bonus of DEFAULT_COMPOUND_BONUSES) {
    if (matches(codes, bonus)) total += bonus.bonus;
  }
  return total;
}
