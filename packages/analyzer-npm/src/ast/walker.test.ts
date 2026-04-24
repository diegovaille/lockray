import { describe, it, expect } from "vitest";
import { parseFile } from "./parser.js";
import { walk, type Matcher } from "./walker.js";

describe("walk", () => {
  it("invokes each matcher for every node; collected Capabilities preserve order of appearance", () => {
    const parsed = parseFile("a(); b();", "f.js");
    if (parsed.status !== "parsed") throw new Error("fixture parse failed");
    const m: Matcher = {
      id: "any-call",
      rule: "NEW_NETWORK_CALL",
      check(path, _source, filePath) {
        if (path.node.type !== "CallExpression") return null;
        const callee = path.node.callee;
        if (callee.type !== "Identifier") return null;
        return {
          matcher: "any-call",
          rule: "NEW_NETWORK_CALL",
          filePath,
          snippet: callee.name + "()",
        };
      },
    };
    const out = walk(parsed.ast, "a(); b();", "f.js", [m]);
    expect(out.map((c) => c.snippet)).toEqual(["a()", "b()"]);
  });

  it("returns [] when no matcher produces a capability", () => {
    const parsed = parseFile("const x = 1;", "f.js");
    if (parsed.status !== "parsed") throw new Error("fixture parse failed");
    const m: Matcher = {
      id: "never",
      rule: "NEW_CHILD_PROCESS",
      check: () => null,
    };
    expect(walk(parsed.ast, "const x = 1;", "f.js", [m])).toEqual([]);
  });
});
