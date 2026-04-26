# LockRay

Behavioral diff analysis for dependency PRs.

> Dependabot tells you *what* changed; LockRay tells you whether the change *behaves* suspiciously.

**Status:** v0.4 — demo-ready with AST capability detection. The scoring engine now receives findings from three AST-backed rules that detect newly-introduced dangerous capabilities (network, child-process, credential access) partitioned by install-context vs runtime-context. See the [design spec](docs/specs/2026-04-20-lockray-design.md).

## What it catches today

- `INTEGRITY_MISMATCH` — lockfile hash changed without a version change (republish tamper, **hard-fail**)
- `NEW_DEPENDENCY_SOURCE` — resolved URL changed without a version change (registry redirection, **hard-fail**)
- `MALICIOUS_INSTALL_SCRIPT` — new/changed install hook matches a curated malicious pattern (**hard-fail**)
- `NEW_POSTINSTALL_SCRIPT` — new or changed `preinstall` / `install` / `postinstall` / `prepare` hook
- `KNOWN_COMPROMISED_PACKAGE` — OSV advisory marks the package as malicious (**hard-fail**)
- `CVE_VULNERABILITY` — OSV match with severity mapped from CVSS
- `NEW_NETWORK_CALL` (HIGH) — package newly introduces `fetch`, `XMLHttpRequest`, `http.request`/`https.request`, `net.connect`, or `axios.*` calls. Partitioned by install vs runtime context.
- `NEW_CHILD_PROCESS` (HIGH) — package newly introduces `child_process.exec`/`execFile`/`spawn`/`fork` calls.
- `NEW_CREDENTIAL_ACCESS` (HIGH) — package newly reads `process.env` or known credential file paths (`~/.npmrc`, `~/.ssh/*`, `~/.aws/credentials`, `~/.netrc`).

Supported ecosystems: npm (`package-lock.json`, `pnpm-lock.yaml`). PyPI and `yarn.lock` land in v1.1. Obfuscation heuristics land in M4.2.1; install-script AST promotion in M4.2.2.

## CLI usage

```bash
# Run on any repo with a lockfile, comparing two refs
lockray check --base origin/main --head HEAD --format pretty
```

Flags: `--base`, `--head`, `--cwd`, `--format` (`json` or `pretty`).

The JSON shape is the `PrReport` type exported from `@lockray/types` (score, verdict, per-package reports, topRisks, counts, risk density). The v0.2 top-level fields `changes`, `findings`, and `blocked` are retained as backwards-compatible views and will be dropped in v1.0; new consumers should read `verdict` and `packages` instead.

## GitHub Action

v0.4 ships a GitHub Action that wraps the CLI using a two-job fork-safe design (spec §18). `analyze` runs unprivileged on `pull_request`; `report` runs privileged on `workflow_run` and posts a PR comment + sets the `lockray/risk` status check.

```yaml
# .github/workflows/lockray.yml
name: LockRay

on:
  pull_request:
  workflow_run:
    workflows: ["LockRay"]
    types: ["completed"]

permissions:
  contents: read

jobs:
  analyze:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      # v0.4 limitation: the Action expects `lockray` on PATH. Until the
      # bundled-CLI variant lands in M4.3, consumers install @lockray/cli
      # explicitly (or link from a workspace):
      - run: npm install -g @lockray/cli
      - uses: lockray/action@v0.4
        with:
          mode: analyze
          fail-on-risk: "true"

  report:
    if: >-
      github.event_name == 'workflow_run' &&
      github.event.workflow_run.event == 'pull_request' &&
      github.event.workflow_run.conclusion != 'skipped'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
      actions: read
    steps:
      - uses: actions/checkout@v4
      - uses: lockray/action@v0.4
        with:
          mode: report
          workflow-run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The report job derives PR number, head SHA, and `fail-on-risk` from trusted sources (the `workflow_run` event payload and the privileged job's own input), never from the artifact the unprivileged analyze job uploads. The PR-comment body now shows the verdict + score, a one-line counts summary (flagged · block · review · risk density), and a Top risks section.

## Known v0.4 limitations

- The Action expects the `lockray` CLI to resolve on PATH in the analyze job (install via `npm install -g @lockray/cli` or `npm link`). A bundled-CLI Action variant is planned for M4.3 so external consumers get zero-setup.
- No `.lockray.yml` config yet — scoring weights, thresholds, and compound bonuses use spec §9 defaults. Config-file loading lands in M6.
- No transitive-hybrid escalation cache (M6).
- Pagination past the first 100 PR comments / workflow artifacts is deferred to M4.

## Development

```bash
nvm use         # Node 22
npm install
npm run build
npm test
```

Run the CLI from source: `node packages/cli/dist/bin/lockray.js check --help`.

Rebuild the Action bundle after changing `packages/action/src/`: `npm run bundle --workspace @lockray/action`.

## Releases

- `v0.4` — M4.2 AST capability detection (NEW_NETWORK_CALL, NEW_CHILD_PROCESS, NEW_CREDENTIAL_ACCESS)
- `v0.3.1` — docs-only refresh of v0.3 release surfaces
- `v0.3` — M4.1 PrReport schema v1 + scoring engine
- `v0.2.2` — M3 GitHub Action + fork-safety hardening
- `v0.1` — M2 findings + hard-fails + corpus harness
- `m1` — M1 change detection skeleton
