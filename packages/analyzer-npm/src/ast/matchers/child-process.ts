import type {
  CallExpression,
  Identifier,
  MemberExpression,
  Node,
  StringLiteral,
} from "@babel/types";
import type { Matcher } from "../walker.js";

function snippetFor(source: string, node: Node, fallback: string): string {
  const start = (node as { start?: number }).start ?? null;
  const end = (node as { end?: number }).end ?? null;
  if (start === null || end === null) return fallback.slice(0, 120);
  const raw = source.slice(start, end).replace(/\s+/g, " ").trim();
  return raw.length > 120 ? raw.slice(0, 119) + "…" : raw;
}

function isRequireOf(node: Node, moduleName: string): boolean {
  if (node.type !== "CallExpression") return false;
  const c = node as CallExpression;
  if (c.callee.type !== "Identifier" || (c.callee as Identifier).name !== "require") return false;
  const arg = c.arguments[0];
  if (!arg || arg.type !== "StringLiteral") return false;
  return (arg as StringLiteral).value === moduleName;
}

function isModuleRef(expr: Node, name: string): boolean {
  if (isRequireOf(expr, name)) return true;
  if (expr.type === "Identifier" && (expr as Identifier).name === name) return true;
  return false;
}

function makeMemberCallMatcher(
  moduleName: string,
  methodName: string,
  id: string,
): Matcher {
  return {
    id,
    rule: "NEW_CHILD_PROCESS",
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
        rule: "NEW_CHILD_PROCESS",
        filePath,
        snippet: snippetFor(source, call, `${moduleName}.${methodName}(...)`),
      };
    },
  };
}

export const CHILD_PROCESS_MATCHERS: readonly Matcher[] = [
  makeMemberCallMatcher("child_process", "exec", "child_process.exec"),
  makeMemberCallMatcher("child_process", "execFile", "child_process.execFile"),
  makeMemberCallMatcher("child_process", "spawn", "child_process.spawn"),
  makeMemberCallMatcher("child_process", "fork", "child_process.fork"),
  makeMemberCallMatcher("child_process", "execSync", "child_process.execSync"),
  makeMemberCallMatcher("child_process", "execFileSync", "child_process.execFileSync"),
  makeMemberCallMatcher("child_process", "spawnSync", "child_process.spawnSync"),
];
