import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execaSync } from "execa";

export interface TmpRepo {
  path: string;
  writeFile(relPath: string, content: string): void;
  commit(message: string): string;
  cleanup(): void;
}

export function createTmpRepo(): TmpRepo {
  const path = mkdtempSync(join(tmpdir(), "lockray-repo-"));
  execaSync("git", ["init", "-q", "-b", "main"], { cwd: path });
  execaSync("git", ["config", "user.email", "test@lockray.dev"], { cwd: path });
  execaSync("git", ["config", "user.name", "LockRay Test"], { cwd: path });
  execaSync("git", ["config", "commit.gpgsign", "false"], { cwd: path });

  return {
    path,
    writeFile(relPath, content) {
      const full = join(path, relPath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    },
    commit(message) {
      execaSync("git", ["add", "-A"], { cwd: path });
      execaSync("git", ["commit", "-q", "-m", message], { cwd: path });
      const { stdout } = execaSync("git", ["rev-parse", "HEAD"], { cwd: path });
      return stdout.trim();
    },
    cleanup() {
      rmSync(path, { recursive: true, force: true });
    },
  };
}
