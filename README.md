# LockRay

Behavioral diff analysis for dependency PRs.

> Dependabot tells you *what* changed; LockRay tells you whether the change *behaves* suspiciously.

**Status:** v0.2 — demo-ready. GitHub Action + CLI ship with the detection rules below. See the [design spec](docs/specs/2026-04-20-lockray-design.md).

## What it catches today

- `INTEGRITY_MISMATCH` — lockfile hash changed without a version change (republish tamper, **hard-fail**)
- `NEW_DEPENDENCY_SOURCE` — resolved URL changed without a version change (registry redirection, **hard-fail**)
- `MALICIOUS_INSTALL_SCRIPT` — new/changed install hook matches a curated malicious pattern (**hard-fail**)
- `NEW_POSTINSTALL_SCRIPT` — new or changed `preinstall` / `install` / `postinstall` / `prepare` hook
- `KNOWN_COMPROMISED_PACKAGE` — OSV advisory marks the package as malicious (**hard-fail**)
- `CVE_VULNERABILITY` — OSV match with severity mapped from CVSS

Supported ecosystems: npm (`package-lock.json`, `pnpm-lock.yaml`). PyPI and `yarn.lock` land in v1.1. AST behavioral diff, trust signals, and the scoring engine arrive in M4.

## CLI usage

```bash
# Run on any repo with a lockfile, comparing two refs
lockray check --base origin/main --head HEAD --format pretty
```

Flags: `--base`, `--head`, `--cwd`, `--format` (`json` or `pretty`).

The JSON shape is documented as `CliReport` in `@lockray/types` and is consumed by the Action + any external tooling.

## GitHub Action

v0.2 ships a GitHub Action that wraps the CLI using a two-job fork-safe design (spec §18). `analyze` runs unprivileged on `pull_request`; `report` runs privileged on `workflow_run` and posts a PR comment + sets the `lockray/risk` status check.

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
      # v0.2 limitation: the Action expects `lockray` on PATH. Until the
      # bundled-CLI variant lands in M4, consumers install @lockray/cli
      # explicitly (or link from a workspace):
      - run: npm install -g @lockray/cli
      - uses: lockray/action@v0.2
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
      - uses: lockray/action@v0.2
        with:
          mode: report
          workflow-run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The report job derives PR number, head SHA, and `fail-on-risk` from trusted sources (the `workflow_run` event payload and the privileged job's own input), never from the artifact the unprivileged analyze job uploads.

## Known v0.2 limitations

- The Action expects the `lockray` CLI to resolve on PATH in the analyze job (install via `npm install -g @lockray/cli` or `npm link`). A bundled-CLI Action variant is planned for M4 so external consumers get zero-setup.
- No scoring engine yet — findings are emitted individually with severity and a top-level `blocked` flag from hard-fails. Weighted scoring with compound bonuses lands in M4.
- No AST-level behavioral diff yet — M2 malicious-pattern matching is regex-based (curl|sh, wget|bash, env-exfil, base64|sh, powershell IEX). AST analysis in M4 will expand the rule surface.
- No `.lockray.yml` config / no transitive-hybrid escalation cache yet (M6).
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

- `v0.2` — M3 GitHub Action (current)
- `v0.1` — M2 findings + hard-fails + corpus harness
- `m1` — M1 change detection skeleton
