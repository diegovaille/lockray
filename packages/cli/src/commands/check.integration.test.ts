import { describe, it, expect, afterEach } from "vitest";
import { buildProgram } from "../index.js";
import { createTmpRepo, type TmpRepo } from "../../../../tests/helpers/tmp-repo.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIX = join(process.cwd(), "tests/fixtures/package-lock");

describe("lockray check (integration)", () => {
  let repo: TmpRepo | null = null;
  let originalWrite: typeof process.stdout.write;
  let captured: string;

  function startCapture(): void {
    captured = "";
    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      captured += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    }) as typeof process.stdout.write;
  }

  function stopCapture(): void {
    process.stdout.write = originalWrite;
  }

  afterEach(() => {
    stopCapture();
    repo?.cleanup();
    repo = null;
  });

  it("emits JSON array of changes for a real two-commit repo", async () => {
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
    const headSha = repo.commit("bump deps");

    startCapture();
    const program = buildProgram();
    await program.parseAsync([
      "node",
      "lockray",
      "check",
      "--cwd",
      repo.path,
      "--base",
      baseSha,
      "--head",
      headSha,
      "--format",
      "json",
    ]);
    stopCapture();

    const output = JSON.parse(captured);
    expect(Array.isArray(output.changes)).toBe(true);
    expect(output.changes).toHaveLength(2);
    const lodash = output.changes.find((c: { name: string }) => c.name === "lodash");
    expect(lodash).toMatchObject({
      name: "lodash",
      fromVersion: "4.17.20",
      toVersion: "4.17.21",
      direct: true,
    });
  });

  it("emits empty changes array when lockfile is unchanged between refs", async () => {
    repo = createTmpRepo();
    const content = readFileSync(join(FIX, "v3-simple-before.json"), "utf8");
    const manifest = JSON.stringify({ name: "demo", version: "1.0.0" });
    repo.writeFile("package.json", manifest);
    repo.writeFile("package-lock.json", content);
    const sha1 = repo.commit("one");
    repo.writeFile("README.md", "hi");
    const sha2 = repo.commit("two");

    startCapture();
    const program = buildProgram();
    await program.parseAsync([
      "node",
      "lockray",
      "check",
      "--cwd",
      repo.path,
      "--base",
      sha1,
      "--head",
      sha2,
      "--format",
      "json",
    ]);
    stopCapture();

    const output = JSON.parse(captured);
    expect(output.changes).toEqual([]);
  });
});
