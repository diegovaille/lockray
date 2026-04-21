# LockRay Corpus Fixtures

Synthetic fixture packages used by the corpus harness test
(`tests/corpus/harness.test.ts`). Each fixture is a directory with a
`package.json`. The harness feeds these through the real classifier
pipeline (with stub fetcher + stub OSV) and asserts the expected
verdict in `manifest.json`.

**All malicious fixtures are synthetic.** They model the *shape* of
known attack patterns (install-hook exfil, integrity tampering, source
redirection, etc.) but contain no working exploit code. No fixture's
`postinstall` script will run in normal test execution — the harness
only parses and classifies.

## Adding a fixture

1. Create a directory under `clean/` or `malicious/`.
2. Add a `package.json` with at minimum `name` and `version`.
3. Add an entry to `manifest.json` describing the expected verdict.
4. Re-run `npm test -- tests/corpus`.
