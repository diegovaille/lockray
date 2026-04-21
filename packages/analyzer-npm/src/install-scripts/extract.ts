export type InstallHook = "preinstall" | "install" | "postinstall" | "prepare";

export type InstallScripts = Partial<Record<InstallHook, string>>;

export const HOOKS: readonly InstallHook[] = ["preinstall", "install", "postinstall", "prepare"];

/**
 * Pull the install-lifecycle hook scripts out of a parsed package.json.
 * Returns only hooks whose value is a string; anything non-string is ignored.
 */
export function extractInstallScripts(
  packageJson: Record<string, unknown>,
): InstallScripts {
  const raw = packageJson.scripts;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const scripts = raw as Record<string, unknown>;

  const out: InstallScripts = {};
  for (const hook of HOOKS) {
    const value = scripts[hook];
    if (typeof value === "string") out[hook] = value;
  }
  return out;
}
