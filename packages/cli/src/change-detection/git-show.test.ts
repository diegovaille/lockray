import { describe, it, expect, afterEach } from "vitest";
import { makeGitShow } from "./git-show.js";
import { createTmpRepo, type TmpRepo } from "../../../../tests/helpers/tmp-repo.js";

describe("makeGitShow", () => {
  let repo: TmpRepo | null = null;

  afterEach(() => {
    repo?.cleanup();
    repo = null;
  });

  it("returns file contents at a given ref", async () => {
    repo = createTmpRepo();
    repo.writeFile("hello.txt", "one\n");
    const sha1 = repo.commit("add hello");
    repo.writeFile("hello.txt", "two\n");
    repo.commit("update hello");

    const gitShow = makeGitShow(repo.path);
    const atFirst = await gitShow(sha1, "hello.txt");
    expect(atFirst).toBe("one\n");
  });

  it("returns null when the path does not exist at the ref", async () => {
    repo = createTmpRepo();
    repo.writeFile("a.txt", "a");
    const sha = repo.commit("init");

    const gitShow = makeGitShow(repo.path);
    const result = await gitShow(sha, "does-not-exist.txt");
    expect(result).toBeNull();
  });
});
