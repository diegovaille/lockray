import { parse as babelParse } from "@babel/parser";
import type { ParserOptions } from "@babel/parser";
import type { File } from "@babel/types";

export type FileParseResult =
  | { status: "parsed"; ast: File; warnings: string[] }
  | { status: "skipped"; reason: FileParseSkipReason }
  | { status: "error"; message: string };

export type FileParseSkipReason =
  | "unsupported-extension"
  | "too-large"
  | "minified-or-bundled"
  | "non-runtime-path";

/**
 * Pick a Babel dialect configuration from the file extension. We want
 * real-world tolerance over strictness — packages routinely ship .js
 * files with TS-flavoured syntax, decorators, stage-3 proposals, etc.
 */
function configFor(filePath: string): ParserOptions {
  const isTs = /\.tsx?$/i.test(filePath);
  const isJsx = /\.[jt]sx$/i.test(filePath);
  return {
    sourceType: "unambiguous",
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowNewTargetOutsideFunction: true,
    allowSuperOutsideMethod: true,
    errorRecovery: true,
    plugins: [
      isTs ? "typescript" : "flow",
      isJsx ? "jsx" : null,
      "decorators-legacy",
      "classProperties",
      "classPrivateProperties",
      "classPrivateMethods",
      "topLevelAwait",
      "explicitResourceManagement",
      "importAssertions",
      "dynamicImport",
    ].filter(Boolean) as ParserOptions["plugins"],
  };
}

/**
 * Parse one file. Never throws — syntax errors come back as
 * `{status: "error", message}`. Recoverable parser diagnostics (Babel
 * surfaces these when errorRecovery is on) come back as warnings on a
 * parsed result.
 */
export function parseFile(source: string, filePath: string): FileParseResult {
  try {
    const ast = babelParse(source, configFor(filePath)) as File;
    const warnings: string[] = [];
    const errors = (ast as unknown as { errors?: Array<{ message?: string }> }).errors;
    if (Array.isArray(errors)) {
      for (const e of errors) {
        if (e?.message) warnings.push(e.message);
      }
    }
    return { status: "parsed", ast, warnings };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    return { status: "error", message };
  }
}
