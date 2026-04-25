import type { FileParseSkipReason } from "./parser.js";

export const SKIP_DIRS: readonly string[] = [
  "test",
  "tests",
  "__tests__",
  "spec",
  "__mocks__",
  "example",
  "examples",
  "docs",
  "fixtures",
];

export const SKIP_PATTERNS: readonly RegExp[] = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\.min\.js$/,
  /\.bundle\.js$/,
];

export const MAX_FILE_BYTES = 500_000;

export const ALLOWED_EXTENSIONS: readonly string[] = [
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
];

export interface CoveragePlan {
  parse: Map<string, { bucket: "install" | "runtime"; forced: boolean }>;
  skip: Map<string, FileParseSkipReason>;
  unresolvedScriptTargets: { field: string; value: string }[];
}

/** Is `path` under any SKIP_DIR (as any directory component)? */
function isUnderSkipDir(path: string): boolean {
  const parts = path.split("/");
  for (const p of parts.slice(0, -1)) {
    if (SKIP_DIRS.includes(p)) return true;
  }
  return false;
}

/** Which SKIP_PATTERN matches this path, if any? */
function matchedSkipPattern(path: string): { kind: "minified-or-bundled" | "non-runtime-path" } | null {
  for (const p of SKIP_PATTERNS) {
    if (p.test(path)) {
      // min / bundle → minified-or-bundled; test / spec → non-runtime-path.
      if (/\.min\.js$/.test(path) || /\.bundle\.js$/.test(path)) return { kind: "minified-or-bundled" };
      return { kind: "non-runtime-path" };
    }
  }
  return null;
}

/** Strip a leading "./" if present. */
function stripDotSlash(p: string): string {
  return p.startsWith("./") ? p.slice(2) : p;
}

/** Resolution ladder: exact, +ext, /index+ext. Returns the first existing key in sourceFiles, or null. */
function resolvePath(
  candidate: string,
  sourceFiles: ReadonlyMap<string, string>,
): string | null {
  const base = stripDotSlash(candidate).replace(/\/+$/, "");
  if (sourceFiles.has(base)) return base;
  for (const ext of ALLOWED_EXTENSIONS) {
    const withExt = base + ext;
    if (sourceFiles.has(withExt)) return withExt;
  }
  for (const ext of ALLOWED_EXTENSIONS) {
    const withIndex = `${base}/index${ext}`;
    if (sourceFiles.has(withIndex)) return withIndex;
  }
  return null;
}

/** Very small shell tokenizer: splits on whitespace respecting single+double quotes. No env expansion, no subshells. */
function tokenize(cmd: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!;
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buf += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      continue;
    }
    buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens;
}

const SHELL_REJECT_TOKENS: readonly string[] = ["|", "&&", "||", ";", "&", "`", "$(", ">", "<"];

function hasShellComposition(tokens: readonly string[]): boolean {
  for (const t of tokens) {
    if (SHELL_REJECT_TOKENS.includes(t)) return true;
    // $( substring — can appear glued to adjacent text
    if (t.includes("$(") || t.includes("`")) return true;
  }
  return false;
}

function hasNodeEval(tokens: readonly string[]): boolean {
  for (let i = 0; i < tokens.length - 1; i++) {
    if ((tokens[i] === "node" || tokens[i] === "nodejs") &&
        (tokens[i + 1] === "-e" || tokens[i + 1] === "--eval")) {
      return true;
    }
  }
  return false;
}

function hasShellCFlag(tokens: readonly string[]): boolean {
  for (let i = 0; i < tokens.length - 1; i++) {
    if ((tokens[i] === "sh" || tokens[i] === "bash" || tokens[i] === "zsh") && tokens[i + 1] === "-c") {
      return true;
    }
  }
  return false;
}

function hasNpmRun(tokens: readonly string[]): boolean {
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === "npm" && tokens[i + 1] === "run") return true;
  }
  return false;
}

/** Does token look like a file path: starts with ./ or ../ or /, contains a /, OR has a supported extension? */
function looksLikeFileToken(tok: string): boolean {
  if (tok.startsWith("./") || tok.startsWith("../") || tok.startsWith("/")) return true;
  if (tok.includes("/")) return true;
  for (const ext of ALLOWED_EXTENSIONS) {
    if (tok.endsWith(ext)) return true;
  }
  return false;
}

/** Extract a plain file-path candidate from a scripts.* command string, or return null for complex/opaque commands. */
function extractScriptTarget(cmd: string): string | null {
  const trimmed = cmd.trim();
  if (!trimmed) return null;
  const tokens = tokenize(trimmed);
  if (hasShellComposition(tokens)) return null;
  if (hasNodeEval(tokens)) return null;
  if (hasShellCFlag(tokens)) return null;
  if (hasNpmRun(tokens)) return null;
  for (const tok of tokens) {
    if (tok.startsWith("-")) continue; // option flag
    if (looksLikeFileToken(tok)) return tok;
  }
  return null;
}

/** Recursively collect string values under `exports`. */
function collectExportsStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectExportsStrings(v, out);
    }
  }
}

/** Collect every path-like value we should try to force-include, with attribution. */
function collectForcedIncludeCandidates(
  pkg: Record<string, unknown>,
): { field: string; value: string; bucket: "install" | "runtime" }[] {
  const out: { field: string; value: string; bucket: "install" | "runtime" }[] = [];

  const runtimeStringFields = ["main", "module", "browser"] as const;
  for (const f of runtimeStringFields) {
    const v = pkg[f];
    if (typeof v === "string") out.push({ field: f, value: v, bucket: "runtime" });
  }

  const exp = pkg["exports"];
  if (exp !== undefined) {
    const strs: string[] = [];
    collectExportsStrings(exp, strs);
    for (const s of strs) out.push({ field: "exports", value: s, bucket: "runtime" });
  }

  const bin = pkg["bin"];
  if (typeof bin === "string") out.push({ field: "bin", value: bin, bucket: "runtime" });
  else if (bin && typeof bin === "object") {
    for (const v of Object.values(bin as Record<string, unknown>)) {
      if (typeof v === "string") out.push({ field: "bin", value: v, bucket: "runtime" });
    }
  }

  const scripts = pkg["scripts"];
  if (scripts && typeof scripts === "object") {
    const lifecycle = ["preinstall", "install", "postinstall", "prepare"] as const;
    for (const f of lifecycle) {
      const v = (scripts as Record<string, unknown>)[f];
      if (typeof v === "string") out.push({ field: `scripts.${f}`, value: v, bucket: "install" });
    }
  }

  return out;
}

/**
 * Plan coverage for a package given its manifest and source-file map.
 * See spec §3.5 for the algorithm.
 */
export function planCoverage(
  pkg: Record<string, unknown>,
  sourceFiles: ReadonlyMap<string, string>,
): CoveragePlan {
  const plan: CoveragePlan = {
    parse: new Map(),
    skip: new Map(),
    unresolvedScriptTargets: [],
  };

  // Forced-include pass.
  const forcedMap = new Map<string, "install" | "runtime">();
  for (const cand of collectForcedIncludeCandidates(pkg)) {
    // For scripts.* fields, extract the file target; other fields are bare paths.
    const path = cand.field.startsWith("scripts.") ? extractScriptTarget(cand.value) : cand.value;
    if (path === null) {
      plan.unresolvedScriptTargets.push({ field: cand.field, value: cand.value });
      continue;
    }
    const resolved = resolvePath(path, sourceFiles);
    if (resolved === null) {
      plan.unresolvedScriptTargets.push({ field: cand.field, value: cand.value });
      continue;
    }
    // Install wins union.
    const prev = forcedMap.get(resolved);
    if (cand.bucket === "install" || prev === "install") {
      forcedMap.set(resolved, "install");
    } else {
      forcedMap.set(resolved, "runtime");
    }
  }

  // Walk every source file.
  for (const [path, content] of sourceFiles.entries()) {
    const size = Buffer.byteLength(content, "utf8");

    if (forcedMap.has(path)) {
      if (size > MAX_FILE_BYTES) {
        plan.skip.set(path, "too-large");
      } else {
        plan.parse.set(path, { bucket: forcedMap.get(path)!, forced: true });
      }
      continue;
    }

    // Not forced-include: apply skip rules in order.
    const dotIdx = path.lastIndexOf(".");
    const ext = dotIdx >= 0 ? path.slice(dotIdx) : "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      plan.skip.set(path, "unsupported-extension");
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      plan.skip.set(path, "too-large");
      continue;
    }
    const byPattern = matchedSkipPattern(path);
    if (byPattern) {
      plan.skip.set(path, byPattern.kind);
      continue;
    }
    if (isUnderSkipDir(path)) {
      plan.skip.set(path, "non-runtime-path");
      continue;
    }
    plan.parse.set(path, { bucket: "runtime", forced: false });
  }

  return plan;
}
