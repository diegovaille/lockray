export interface NpmLockEntry {
  name: string;
  version: string;
  integrity: string | null;
  resolved: string | null;
  isRoot: boolean;
}

export interface NpmLockfile {
  format: "package-lock-v2" | "package-lock-v3" | "pnpm-lock-v9";
  lockfileVersionRaw: string;
  entries: Map<string, NpmLockEntry>;
}
