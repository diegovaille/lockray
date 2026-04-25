import type { Matcher } from "../walker.js";
import { NETWORK_MATCHERS } from "./network.js";
import { CHILD_PROCESS_MATCHERS } from "./child-process.js";
import { CREDENTIAL_ACCESS_MATCHERS } from "./credential-access.js";

/** Every AST matcher M4.2 registers. Consumed once per file walk. */
export const MATCHERS: readonly Matcher[] = [
  ...NETWORK_MATCHERS,
  ...CHILD_PROCESS_MATCHERS,
  ...CREDENTIAL_ACCESS_MATCHERS,
];

export { NETWORK_MATCHERS, CHILD_PROCESS_MATCHERS, CREDENTIAL_ACCESS_MATCHERS };
