import type {
  AssignmentExpression,
  CallExpression,
  Identifier,
  MemberExpression,
  Node,
  StringLiteral,
  TemplateLiteral,
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

/** Known credential path fragments (substring-matched on literal path values). */
const CREDENTIAL_PATH_PATTERNS: readonly RegExp[] = [
  /\.npmrc\b/,
  /\.ssh\/(?:id_[a-z0-9]+|config|authorized_keys)\b/,
  /\.aws\/credentials\b/,
  /\.netrc\b/,
  /\.docker\/config\.json\b/,
  /\.gitconfig\b/,
];

function isCredentialLiteralPath(pathValue: string): boolean {
  return CREDENTIAL_PATH_PATTERNS.some((p) => p.test(pathValue));
}

/** True when `node` is an `os.homedir()` call (via require or bare identifier). */
function isHomedirCall(node: Node): boolean {
  if (node.type !== "CallExpression") return false;
  const call = node as CallExpression;
  if (call.callee.type !== "MemberExpression") return false;
  const mem = call.callee as MemberExpression;
  if (mem.computed) return false;
  if (mem.property.type !== "Identifier") return false;
  if ((mem.property as Identifier).name !== "homedir") return false;
  return isModuleRef(mem.object, "os");
}

/** Match process.env.<name> AND process.env[expr] reads. Excludes assignment targets. */
const PROCESS_ENV_READ: Matcher = {
  id: "process.env.read",
  rule: "NEW_CREDENTIAL_ACCESS",
  check(path, source, filePath) {
    if (path.node.type !== "MemberExpression") return null;
    const outer = path.node as MemberExpression;
    // outer is the `process.env` member expression, OR the final
    // `.NAME` / `[expr]` member on top. We fire on the top-level access
    // `process.env.NAME` / `process.env[expr]` only.
    if (outer.object.type !== "MemberExpression") return null;
    const inner = outer.object as MemberExpression;
    if (inner.computed) return null;
    if (inner.object.type !== "Identifier" || (inner.object as Identifier).name !== "process") return null;
    if (inner.property.type !== "Identifier" || (inner.property as Identifier).name !== "env") return null;
    // Skip assignment targets: process.env.X = "..."
    const parent = path.parent;
    if (
      parent &&
      parent.type === "AssignmentExpression" &&
      (parent as AssignmentExpression).left === path.node
    ) {
      return null;
    }
    return {
      matcher: "process.env.read",
      rule: "NEW_CREDENTIAL_ACCESS",
      filePath,
      snippet: snippetFor(source, outer, "process.env.<var>"),
    };
  },
};

/** Match fs.readFile(...) / fs.readFileSync(...) whose first arg is a literal credential path. */
const FS_CREDENTIAL_PATH: Matcher = {
  id: "fs.credential-path",
  rule: "NEW_CREDENTIAL_ACCESS",
  check(path, source, filePath) {
    if (path.node.type !== "CallExpression") return null;
    const call = path.node as CallExpression;
    if (call.callee.type !== "MemberExpression") return null;
    const mem = call.callee as MemberExpression;
    if (mem.computed) return null;
    if (mem.property.type !== "Identifier") return null;
    const method = (mem.property as Identifier).name;
    if (method !== "readFile" && method !== "readFileSync" && method !== "readFileAsync") return null;
    if (!isModuleRef(mem.object, "fs")) return null;
    const first = call.arguments[0];
    if (!first) return null;
    if (first.type !== "StringLiteral") return null;
    const literal = (first as StringLiteral).value;
    if (!isCredentialLiteralPath(literal)) return null;
    return {
      matcher: "fs.credential-path",
      rule: "NEW_CREDENTIAL_ACCESS",
      filePath,
      snippet: snippetFor(source, call, `fs.${method}(...)`),
    };
  },
};

/** Match fs.readFile(`${os.homedir()}/<credential-suffix>`). */
const FS_CREDENTIAL_PATH_HOME: Matcher = {
  id: "fs.credential-path-home",
  rule: "NEW_CREDENTIAL_ACCESS",
  check(path, source, filePath) {
    if (path.node.type !== "CallExpression") return null;
    const call = path.node as CallExpression;
    if (call.callee.type !== "MemberExpression") return null;
    const mem = call.callee as MemberExpression;
    if (mem.computed) return null;
    if (mem.property.type !== "Identifier") return null;
    const method = (mem.property as Identifier).name;
    if (method !== "readFile" && method !== "readFileSync" && method !== "readFileAsync") return null;
    if (!isModuleRef(mem.object, "fs")) return null;
    const first = call.arguments[0];
    if (!first || first.type !== "TemplateLiteral") return null;
    const tpl = first as TemplateLiteral;
    // Must contain at least one os.homedir() call in its expressions.
    const hasHomedir = tpl.expressions.some((e) => isHomedirCall(e as Node));
    if (!hasHomedir) return null;
    // And the quasi strings must combine to mention a credential suffix.
    const suffix = tpl.quasis.map((q) => q.value.cooked ?? "").join("");
    if (!isCredentialLiteralPath(suffix)) return null;
    return {
      matcher: "fs.credential-path-home",
      rule: "NEW_CREDENTIAL_ACCESS",
      filePath,
      snippet: snippetFor(source, call, `fs.${method}(\`\${os.homedir()}/...\`)`),
    };
  },
};

export const CREDENTIAL_ACCESS_MATCHERS: readonly Matcher[] = [
  PROCESS_ENV_READ,
  FS_CREDENTIAL_PATH,
  FS_CREDENTIAL_PATH_HOME,
];
