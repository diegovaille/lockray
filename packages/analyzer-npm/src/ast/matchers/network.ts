import type { NodePath } from "@babel/traverse";
import type {
  CallExpression,
  Identifier,
  MemberExpression,
  NewExpression,
  Node,
  StringLiteral,
} from "@babel/types";
import type { Capability } from "../capability-shape.js";
import type { Matcher } from "../walker.js";

/** Extract a one-line snippet from source offsets, capped at 120 chars. */
function snippetFor(
  source: string,
  node: Node,
  fallback: string,
): string {
  const start = (node as { start?: number }).start ?? null;
  const end = (node as { end?: number }).end ?? null;
  if (start === null || end === null) return fallback.slice(0, 120);
  const raw = source.slice(start, end).replace(/\s+/g, " ").trim();
  return raw.length > 120 ? raw.slice(0, 119) + "…" : raw;
}

/** True when `node` is `require("x")` with x === moduleName (as a string literal). */
function isRequireOf(node: Node, moduleName: string): boolean {
  if (node.type !== "CallExpression") return false;
  const c = node as CallExpression;
  if (c.callee.type !== "Identifier" || (c.callee as Identifier).name !== "require") return false;
  const arg = c.arguments[0];
  if (!arg || arg.type !== "StringLiteral") return false;
  return (arg as StringLiteral).value === moduleName;
}

/** Does `expr` identify the node module `name`? Either `require("name")` or the Identifier `name` (bare global use). */
function isModuleRef(expr: Node, name: string): boolean {
  if (isRequireOf(expr, name)) return true;
  if (expr.type === "Identifier" && (expr as Identifier).name === name) return true;
  return false;
}

/**
 * Match `<moduleRef>.<method>(...)` call patterns, where moduleRef is
 * either `require("mod")` or a bare identifier named `mod`.
 */
function makeMemberCallMatcher(
  moduleName: string,
  methodName: string,
  id: string,
): Matcher {
  return {
    id,
    rule: "NEW_NETWORK_CALL",
    check(path, source, filePath) {
      if (path.node.type !== "CallExpression") return null;
      const call = path.node as CallExpression;
      if (call.callee.type !== "MemberExpression") return null;
      const mem = call.callee as MemberExpression;
      if (mem.computed) return null;
      if (mem.property.type !== "Identifier") return null;
      if ((mem.property as Identifier).name !== methodName) return null;
      if (!isModuleRef(mem.object, moduleName)) return null;
      return {
        matcher: id,
        rule: "NEW_NETWORK_CALL",
        filePath,
        snippet: snippetFor(source, call, `${moduleName}.${methodName}(...)`),
      };
    },
  };
}

/** Match a bare `fetch(...)` call (global). */
const FETCH_MATCHER: Matcher = {
  id: "fetch",
  rule: "NEW_NETWORK_CALL",
  check(path, source, filePath) {
    if (path.node.type !== "CallExpression") return null;
    const call = path.node as CallExpression;
    if (call.callee.type !== "Identifier") return null;
    if ((call.callee as Identifier).name !== "fetch") return null;
    return {
      matcher: "fetch",
      rule: "NEW_NETWORK_CALL",
      filePath,
      snippet: snippetFor(source, call, "fetch(...)"),
    };
  },
};

/** Match `new XMLHttpRequest()`. */
const XHR_MATCHER: Matcher = {
  id: "XMLHttpRequest",
  rule: "NEW_NETWORK_CALL",
  check(path, source, filePath) {
    if (path.node.type !== "NewExpression") return null;
    const n = path.node as NewExpression;
    if (n.callee.type !== "Identifier") return null;
    if ((n.callee as Identifier).name !== "XMLHttpRequest") return null;
    return {
      matcher: "XMLHttpRequest",
      rule: "NEW_NETWORK_CALL",
      filePath,
      snippet: snippetFor(source, n, "new XMLHttpRequest()"),
    };
  },
};

export const NETWORK_MATCHERS: readonly Matcher[] = [
  FETCH_MATCHER,
  XHR_MATCHER,
  makeMemberCallMatcher("http", "request", "http.request"),
  makeMemberCallMatcher("http", "get", "http.get"),
  makeMemberCallMatcher("https", "request", "https.request"),
  makeMemberCallMatcher("https", "get", "https.get"),
  makeMemberCallMatcher("net", "connect", "net.connect"),
  makeMemberCallMatcher("net", "createConnection", "net.createConnection"),
  makeMemberCallMatcher("axios", "get", "axios.get"),
  makeMemberCallMatcher("axios", "post", "axios.post"),
  makeMemberCallMatcher("axios", "request", "axios.request"),
];
