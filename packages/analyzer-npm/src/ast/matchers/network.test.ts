import { describe, it, expect } from "vitest";
import { parseFile } from "../parser.js";
import { walk } from "../walker.js";
import { NETWORK_MATCHERS } from "./network.js";

function capsFor(source: string, filePath = "f.js") {
  const r = parseFile(source, filePath);
  if (r.status !== "parsed") throw new Error("fixture failed to parse: " + source);
  return walk(r.ast, source, filePath, NETWORK_MATCHERS);
}

describe("NETWORK_MATCHERS", () => {
  it("matches fetch(...)", () => {
    const caps = capsFor(`fetch("https://example.com")`);
    expect(caps.map((c) => c.matcher)).toContain("fetch");
  });

  it("matches https.request(...) and http.request(...)", () => {
    const caps = capsFor(`
      const https = require("https");
      https.request({host:"x"});
      const http = require("http");
      http.request({host:"y"});
    `);
    const matchers = caps.map((c) => c.matcher);
    expect(matchers).toContain("https.request");
    expect(matchers).toContain("http.request");
  });

  it("matches net.connect(...)", () => {
    const caps = capsFor(`require("net").connect(80, "x.com")`);
    expect(caps.map((c) => c.matcher)).toContain("net.connect");
  });

  it("matches new XMLHttpRequest()", () => {
    const caps = capsFor(`const r = new XMLHttpRequest(); r.open("GET","/");`);
    expect(caps.map((c) => c.matcher)).toContain("XMLHttpRequest");
  });

  it("does NOT match fs.readFile — unrelated receiver + method", () => {
    const caps = capsFor(`require("fs").readFile("/x")`);
    expect(caps).toEqual([]);
  });
});
