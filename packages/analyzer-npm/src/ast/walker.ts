import _traverse from "@babel/traverse";
import type { NodePath, TraverseOptions } from "@babel/traverse";
import type { File, Node } from "@babel/types";
import type { Capability } from "./capability-shape.js";

type TraverseFn = (ast: File, opts: TraverseOptions) => void;

/**
 * ESM default-export interop: @babel/traverse ships a CommonJS module
 * whose default export is the traverse function. Under NodeNext ESM
 * resolution, `import traverse from "@babel/traverse"` gives us an
 * object wrapping the default. Unwrap it so call sites are clean.
 */
const traverse: TraverseFn = (
  (_traverse as unknown as { default?: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

export interface Matcher {
  /** Stable matcher id (appears in Capability.matcher and evidence metadata). */
  id: string;
  /** Rule family this matcher contributes to. */
  rule: Capability["rule"];
  /** Return a Capability if this node matches; null otherwise. */
  check(
    path: NodePath<Node>,
    source: string,
    filePath: string,
  ): Capability | null;
}

/**
 * Walk `ast` once, invoking every matcher's check() on every node.
 * Returns collected Capabilities in visit order (approximately source
 * order for depth-first traversal).
 */
export function walk(
  ast: File,
  source: string,
  filePath: string,
  matchers: readonly Matcher[],
): Capability[] {
  const out: Capability[] = [];
  traverse(ast, {
    enter(path) {
      for (const m of matchers) {
        const cap = m.check(path, source, filePath);
        if (cap) out.push(cap);
      }
    },
  });
  return out;
}
