/**
 * Normalized internal shape for matched capabilities. The ONLY contract
 * that crosses the Babel/non-Babel boundary. Matchers build Capability
 * from AST nodes; everything downstream (coverage/diff/findings) uses
 * Capability objects and never imports from @babel/*.
 */
export interface Capability {
  /** Matcher id — stable across versions, e.g. "http.request", "process.env.read". */
  matcher: string;
  /** Which rule family this matcher contributes to. */
  rule: "NEW_NETWORK_CALL" | "NEW_CHILD_PROCESS" | "NEW_CREDENTIAL_ACCESS";
  /** Tarball-root-relative POSIX path. ALWAYS POSIX-separated, ALWAYS relative. */
  filePath: string;
  /** Single-line normalized source snippet, length ≤ 120 chars. */
  snippet: string;
}
