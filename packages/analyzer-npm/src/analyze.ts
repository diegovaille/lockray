import type {
  AnalysisMode,
  DependencyChange,
  FetchedPackage,
  Finding,
  TarballFetcher,
} from "@lockray/types";
import type { OSVClient } from "./cve/osv-client.js";
import { classify } from "./findings/classifier.js";

/**
 * Orchestrate fetch + OSV query + classify for a single DependencyChange.
 * Returns [] if the change has neither a fromVersion nor a toVersion
 * (shouldn't happen given change-detection always sets at least one).
 */
export async function runAnalyze(
  change: DependencyChange,
  fetcher: TarballFetcher,
  osv: OSVClient,
  _mode: AnalysisMode,
): Promise<Finding[]> {
  const [before, after] = await Promise.all([
    change.fromVersion
      ? fetchSafely(fetcher, change.ecosystem, change.name, change.fromVersion)
      : Promise.resolve(null),
    change.toVersion
      ? fetchSafely(fetcher, change.ecosystem, change.name, change.toVersion)
      : Promise.resolve(null),
  ]);

  const vulns = change.toVersion
    ? await osv.queryPackage(change.ecosystem, change.name, change.toVersion)
    : [];

  return classify(change, before, after, vulns);
}

async function fetchSafely(
  fetcher: TarballFetcher,
  ecosystem: DependencyChange["ecosystem"],
  name: string,
  version: string,
): Promise<FetchedPackage | null> {
  try {
    return await fetcher(ecosystem, name, version);
  } catch {
    // For M2 a fetch failure downgrades that side to "unknown" rather
    // than aborting the whole analysis. The classifier handles null.
    return null;
  }
}
