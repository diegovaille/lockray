/**
 * M2 finding codes. Stable string literals — downstream tooling pins
 * on these, so treat renames as breaking changes.
 */
export const FindingCode = {
  MALICIOUS_INSTALL_SCRIPT: "MALICIOUS_INSTALL_SCRIPT",
  NEW_POSTINSTALL_SCRIPT: "NEW_POSTINSTALL_SCRIPT",
  INTEGRITY_MISMATCH: "INTEGRITY_MISMATCH",
  NEW_DEPENDENCY_SOURCE: "NEW_DEPENDENCY_SOURCE",
  KNOWN_COMPROMISED_PACKAGE: "KNOWN_COMPROMISED_PACKAGE",
  CVE_VULNERABILITY: "CVE_VULNERABILITY",
} as const;

export type FindingCodeValue = typeof FindingCode[keyof typeof FindingCode];
