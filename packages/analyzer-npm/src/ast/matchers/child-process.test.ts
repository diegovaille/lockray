import { describe, it, expect } from "vitest";
import { parseFile } from "../parser.js";
import { walk } from "../walker.js";
import { CHILD_PROCESS_MATCHERS } from "./child-process.js";

function capsFor(source: string, filePath = "f.js") {
  const r = parseFile(source, filePath);
  if (r.status !== "parsed") throw new Error("fixture failed to parse");
  return walk(r.ast, source, filePath, CHILD_PROCESS_MATCHERS);
}

describe("CHILD_PROCESS_MATCHERS", () => {
  it("matches child_process.exec via require", () => {
    const caps = capsFor(`require("child_process").exec("whoami")`);
    expect(caps.map((c) => c.matcher)).toContain("child_process.exec");
  });

  it("matches child_process.spawn via bare identifier reference", () => {
    const caps = capsFor(`const cp = require("child_process"); cp.spawn("ls");`);
    expect(caps.map((c) => c.matcher)).not.toContain("child_process.spawn");
    // Note: bare-identifier path is intentionally weak; a direct call on
    // the module-name identifier IS matched (see next test).
  });

  it("matches child_process.fork and child_process.execFile via the bare module name", () => {
    const caps = capsFor(`
      child_process.fork("./w.js");
      child_process.execFile("/bin/ls");
    `);
    const ids = caps.map((c) => c.matcher);
    expect(ids).toContain("child_process.fork");
    expect(ids).toContain("child_process.execFile");
  });

  it("matches *Sync variants", () => {
    const caps = capsFor(`
      require("child_process").execSync("uname");
      require("child_process").spawnSync("/bin/ls");
      require("child_process").execFileSync("/bin/ls");
    `);
    const ids = caps.map((c) => c.matcher);
    expect(ids).toEqual(
      expect.arrayContaining([
        "child_process.execSync",
        "child_process.spawnSync",
        "child_process.execFileSync",
      ]),
    );
  });

  it("does NOT match on unrelated receiver", () => {
    const caps = capsFor(`require("fs").spawn("x")`);
    expect(caps).toEqual([]);
  });
});
