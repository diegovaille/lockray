import { describe, it, expect } from "vitest";
import { parseFile } from "./parser.js";

describe("parseFile", () => {
  it("parses a plain JS file into a parsed result", () => {
    const result = parseFile("const x = 1;", "x.js");
    expect(result.status).toBe("parsed");
  });

  it("parses a TypeScript file (interface + type assertion) into a parsed result", () => {
    const result = parseFile(
      "interface Foo { a: number } const b = 1 as unknown as Foo;",
      "x.ts",
    );
    expect(result.status).toBe("parsed");
  });

  it("parses a TSX file (JSX + TS annotations) into a parsed result", () => {
    const result = parseFile(
      "const C = (p: { n: number }) => <div>{p.n}</div>;",
      "x.tsx",
    );
    expect(result.status).toBe("parsed");
  });

  it("returns status=error on invalid syntax without throwing", () => {
    const result = parseFile("const = ;", "x.js");
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/unexpected/i);
    }
  });
});
