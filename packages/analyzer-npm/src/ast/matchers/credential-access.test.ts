import { describe, it, expect } from "vitest";
import { parseFile } from "../parser.js";
import { walk } from "../walker.js";
import { CREDENTIAL_ACCESS_MATCHERS } from "./credential-access.js";

function capsFor(source: string, filePath = "f.js") {
  const r = parseFile(source, filePath);
  if (r.status !== "parsed") throw new Error("fixture failed to parse");
  return walk(r.ast, source, filePath, CREDENTIAL_ACCESS_MATCHERS);
}

describe("CREDENTIAL_ACCESS_MATCHERS", () => {
  it("matches process.env.NPM_TOKEN read (member access)", () => {
    const caps = capsFor(`const t = process.env.NPM_TOKEN;`);
    expect(caps.map((c) => c.matcher)).toContain("process.env.read");
  });

  it("matches process.env[computed] read", () => {
    const caps = capsFor(`const t = process.env["SECRET"];`);
    expect(caps.map((c) => c.matcher)).toContain("process.env.read");
  });

  it("matches fs.readFile when the first arg is a known credential path", () => {
    const caps = capsFor(`
      require("fs").readFile("/home/x/.npmrc", (_e, _d) => {});
      require("fs").readFileSync("/root/.ssh/id_rsa");
      require("fs").readFile("/nonsense/file.txt", () => {});
    `);
    const ids = caps.map((c) => c.matcher);
    expect(ids).toEqual(
      expect.arrayContaining(["fs.credential-path"]),
    );
    // Only the two credential paths match — the third path must not fire.
    expect(ids.filter((i) => i === "fs.credential-path").length).toBe(2);
  });

  it("matches os.homedir() + credential suffix in a template literal path", () => {
    const caps = capsFor(`
      const os = require("os");
      const fs = require("fs");
      fs.readFile(\`\${os.homedir()}/.aws/credentials\`, () => {});
    `);
    expect(caps.map((c) => c.matcher)).toContain("fs.credential-path-home");
  });

  it("does NOT match process.env assignment (write only)", () => {
    const caps = capsFor(`process.env.NPM_TOKEN = "x";`);
    expect(caps).toEqual([]);
  });
});
