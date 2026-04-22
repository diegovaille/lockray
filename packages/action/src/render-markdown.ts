import type { CliReport, DependencyChange, Finding } from "@lockray/types";

const DEFAULT_MAX_FINDINGS = 25;

export interface RenderOptions {
  /** Cap the number of findings printed in full. Overflow is summarized. */
  maxFindings?: number;
}

function truncate(value: string, max = 72): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function severityEmoji(f: Finding): string {
  if (f.hardFail) return "❌";
  if (f.severity === "critical") return "🚨";
  if (f.severity === "high") return "⚠️";
  return "ℹ️";
}

function renderChange(c: DependencyChange): string {
  const from = c.fromVersion ?? "(added)";
  const to = c.toVersion ?? "(removed)";
  const tag = c.direct ? "direct" : "transitive";
  const flags: string[] = [];
  if (c.integrityChanged) flags.push("integrity changed");
  if (c.sourceChanged) flags.push("source changed");
  const flagStr = flags.length > 0 ? ` — ${flags.join(", ")}` : "";
  return `- \`${c.name}\` \`${from}\` → \`${to}\` (${tag})${flagStr}`;
}

function renderFinding(f: Finding): string {
  const mark = severityEmoji(f);
  const tag = f.hardFail ? `${f.severity}, hard-fail` : f.severity;
  const lines: string[] = [];
  lines.push(`**${mark} \`${f.packageName}@${f.packageVersion}\` — ${f.title}**`);
  lines.push(`rule: \`${f.code}\` (${tag})`);
  for (const e of f.evidence) {
    if (e.metadataField && (e.oldValue !== undefined || e.newValue !== undefined)) {
      const before = truncate(String(e.oldValue ?? "∅"));
      const after = truncate(String(e.newValue ?? "∅"));
      lines.push(`- evidence: \`${e.metadataField}\``);
      lines.push(`  - before: \`${before}\``);
      lines.push(`  - after: \`${after}\``);
    } else if (e.registryUrl || e.oldValue || e.newValue) {
      const before = truncate(String(e.oldValue ?? "∅"));
      const after = truncate(String(e.newValue ?? e.registryUrl ?? "∅"));
      lines.push(`- evidence: resolved source`);
      lines.push(`  - before: \`${before}\``);
      lines.push(`  - after: \`${after}\``);
    } else if (e.advisoryId) {
      const reason = e.confidenceReason ? ` — ${e.confidenceReason}` : "";
      lines.push(`- advisory: \`${e.advisoryId}\`${reason}`);
    } else if (e.confidenceReason) {
      lines.push(`- matched: ${e.confidenceReason}`);
    }
    if (e.remediationHint) {
      lines.push(`- fix: ${e.remediationHint}`);
    }
  }
  return lines.join("\n");
}

export function renderMarkdown(report: CliReport, opts: RenderOptions = {}): string {
  const maxFindings = opts.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const totalFindings = report.workspaces.reduce((n, w) => n + w.findings.length, 0);

  const header: string[] = [];
  header.push(`## 🔍 LockRay — Dependency Risk Report`);
  header.push(`Base: \`${report.base}\` · Head: \`${report.head}\``);
  if (report.blocked) {
    header.push(``);
    header.push(`### ❌ BLOCKED — at least one hard-fail rule fired`);
  } else if (totalFindings > 0) {
    header.push(``);
    header.push(`### ⚠ Review findings below`);
  } else {
    header.push(``);
    header.push(`### ✅ No high-confidence risk signals found`);
  }

  const body: string[] = [];
  let remainingBudget = maxFindings;

  for (const ws of report.workspaces) {
    body.push(``);
    body.push(`### Workspace \`${ws.workspace}\` (${ws.ecosystem}, ${ws.parseOutcome})`);

    // Unanalyzable workspaces: do not imply clean analysis where none happened.
    if (ws.parseOutcome === "missing" || ws.parseOutcome === "invalid" || ws.parseOutcome === "unsupported") {
      body.push(`_Workspace not analyzed (parse outcome: ${ws.parseOutcome})._`);
      continue;
    }

    if (ws.changes.length === 0) {
      body.push(`_No dependency changes detected._`);
    } else {
      body.push(``);
      body.push(`**Dependency changes (${ws.changes.length})**`);
      for (const c of ws.changes) body.push(renderChange(c));
    }

    if (ws.findings.length === 0) {
      body.push(``);
      body.push(`_No findings in this workspace._`);
      continue;
    }

    body.push(``);
    if (remainingBudget > 0) {
      body.push(`**Findings (${ws.findings.length})**`);
      for (const f of ws.findings) {
        if (remainingBudget <= 0) break;
        body.push(``);
        body.push(renderFinding(f));
        remainingBudget -= 1;
      }
    } else {
      body.push(`_Findings omitted — see the truncation notice below._`);
    }
  }

  const omitted = totalFindings - Math.min(totalFindings, maxFindings);
  if (omitted > 0) {
    body.push(``);
    body.push(`_${omitted} more findings omitted — see the full \`report.json\` artifact._`);
  }

  return [...header, ...body, ``].join("\n");
}
