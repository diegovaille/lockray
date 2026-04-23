export { score, type ScoreInput } from "./score.js";
export { buildPackageReport, type PackageKey } from "./package-report.js";
export { buildPrReport, type PrReportInput } from "./pr-report.js";
export { compoundBonusFor } from "./compound.js";
export { contributionFor } from "./contribution.js";
export {
  DEFAULT_SEVERITY_WEIGHTS,
  DEFAULT_LOCATION_MULTIPLIERS,
  DEFAULT_DIMINISHING,
  DEFAULT_THRESHOLDS,
  DEFAULT_COMPOUND_BONUSES,
  verdictFor,
  type Thresholds,
  type CompoundBonus,
} from "./weights.js";
