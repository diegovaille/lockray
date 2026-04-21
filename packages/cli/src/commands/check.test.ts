import { describe, it, expect } from "vitest";
import { buildCheckCommand } from "./check.js";

describe("check command", () => {
  it("registers --base and --head flags", () => {
    const cmd = buildCheckCommand();
    const base = cmd.options.find((o) => o.long === "--base");
    const head = cmd.options.find((o) => o.long === "--head");
    expect(base).toBeDefined();
    expect(head).toBeDefined();
    expect(base?.defaultValue).toBe("origin/main");
    expect(head?.defaultValue).toBe("HEAD");
  });

  it("has a name and description", () => {
    const cmd = buildCheckCommand();
    expect(cmd.name()).toBe("check");
    expect(cmd.description()).toMatch(/analyze.*dependency/i);
  });
});
