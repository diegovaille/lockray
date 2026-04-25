import type { DependencyChange, Evidence, Finding } from "@lockray/types";
import type { CapabilityDiff } from "./diff.js";

interface RuleDescriptor {
  confidence: number;
  severity: "high";
  remediationHint: string;
}

const RULE_DESCRIPTORS: Record<
  "NEW_NETWORK_CALL" | "NEW_CHILD_PROCESS" | "NEW_CREDENTIAL_ACCESS",
  RuleDescriptor
> = {
  NEW_NETWORK_CALL: {
    confidence: 0.8,
    severity: "high",
    remediationHint:
      "Inspect the newly-introduced network call. A request from install-time code is a common exfil pattern.",
  },
  NEW_CHILD_PROCESS: {
    confidence: 0.85,
    severity: "high",
    remediationHint:
      "Inspect the newly-introduced child-process invocation. Shell execution from install-time code is high risk.",
  },
  NEW_CREDENTIAL_ACCESS: {
    confidence: 0.75,
    severity: "high",
    remediationHint:
      "Inspect the newly-introduced credential access. Reading environment secrets or credential files is a common exfil precursor.",
  },
};

function groupBy<T, K>(items: readonly T[], keyOf: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    const arr = out.get(k) ?? [];
    arr.push(it);
    out.set(k, arr);
  }
  return out;
}

function truncateFileList(files: readonly string[]): string {
  const shown = files.slice(0, 5);
  const extra = files.length - shown.length;
  const base = shown.join(", ");
  return extra > 0 ? `${base} (+${extra} more)` : base;
}

function makeEvidence(d: CapabilityDiff): Evidence {
  const rule = RULE_DESCRIPTORS[d.rule];
  return {
    kind: "code-snippet",
    metadataField: `ast.${d.bucket}.${d.matcher}`,
    newValue: d.sampleSnippet,
    confidenceReason: `New in ${d.bucket} context. Before: false. After files: ${truncateFileList(d.afterFiles)}.`,
    remediationHint: rule.remediationHint,
  };
}

export function capabilityDiffToFindings(
  diffs: readonly CapabilityDiff[],
  change: DependencyChange,
): Finding[] {
  const groups = groupBy(diffs, (d) => `${d.rule}|${d.bucket}`);
  const findings: Finding[] = [];
  for (const [, groupDiffs] of groups.entries()) {
    // Deterministic ordering: alphabetic by matcher id.
    const sorted = [...groupDiffs].sort((a, b) =>
      a.matcher.localeCompare(b.matcher),
    );
    const first = sorted[0]!;
    const descriptor = RULE_DESCRIPTORS[first.rule];
    const version = change.toVersion ?? change.fromVersion ?? "";
    findings.push({
      code: first.rule,
      title: `${change.name}@${version}: new ${first.rule} capability in ${first.bucket} context`,
      severity: descriptor.severity,
      confidence: descriptor.confidence,
      evidence: sorted.map(makeEvidence),
      ecosystem: change.ecosystem,
      packageName: change.name,
      packageVersion: version,
      direct: change.direct,
      escalated: false,
      contextBucket: first.bucket,
    });
  }
  return findings;
}
