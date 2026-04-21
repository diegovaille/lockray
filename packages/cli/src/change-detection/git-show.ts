import { execa } from "execa";
import type { GitShowFn } from "@lockray/types";

/**
 * Runs `git show <ref>:<path>` from `cwd` and returns stdout.
 * Returns null if the ref/path combination does not exist (e.g., the lockfile
 * was added in a later commit and isn't present at base).
 */
export function makeGitShow(cwd: string): GitShowFn {
  return async (ref, path) => {
    try {
      const { stdout } = await execa("git", ["show", `${ref}:${path}`], {
        cwd,
        maxBuffer: 50 * 1024 * 1024,
        stripFinalNewline: false,
      });
      return stdout;
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? "";
      if (/exists on disk, but not in/.test(stderr) || /does not exist/.test(stderr)) {
        return null;
      }
      throw new Error(
        `git show ${ref}:${path} failed: ${stderr || (err as Error).message}`,
      );
    }
  };
}
