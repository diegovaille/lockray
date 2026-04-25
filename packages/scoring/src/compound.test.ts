import { describe, it, expect } from "vitest";
import type { Finding } from "@lockray/types";
import { compoundBonusFor } from "./compound.js";

function fWithCode(code: string): Finding {
  return {
    code,
    title: "t",
    severity: "high",
    confidence: 1.0,
    evidence: [],
    ecosystem: "npm",
    packageName: "pkg",
    packageVersion: "1.0.0",
    direct: true,
    escalated: false,
  };
}

describe("compoundBonusFor", () => {
  it("returns 0 when no combination is matched", () => {
    expect(compoundBonusFor([fWithCode("NEW_POSTINSTALL_SCRIPT")])).toBe(0);
  });

  it("returns +25 for NEW_POSTINSTALL_SCRIPT + OBFUSCATED_CODE", () => {
    expect(
      compoundBonusFor([fWithCode("NEW_POSTINSTALL_SCRIPT"), fWithCode("OBFUSCATED_CODE")]),
    ).toBe(25);
  });

  it("sums multiple compound bonuses when all combinations match", () => {
    // network + creds = 20, postinstall + obfuscated = 25, maintainer + network = 15 → 60
    expect(
      compoundBonusFor([
        fWithCode("NEW_NETWORK_CALL"),
        fWithCode("NEW_CREDENTIAL_ACCESS"),
        fWithCode("NEW_POSTINSTALL_SCRIPT"),
        fWithCode("OBFUSCATED_CODE"),
        fWithCode("MAINTAINER_CHANGED"),
      ]),
    ).toBe(60);
  });

  it("does NOT apply bucket-local compound when required codes land in different contextBuckets", () => {
    const findings = [
      fWithCode("NEW_NETWORK_CALL"),
      fWithCode("NEW_CREDENTIAL_ACCESS"),
    ];
    // Stamp different buckets on each.
    (findings[0] as { contextBucket?: "install" | "runtime" }).contextBucket = "install";
    (findings[1] as { contextBucket?: "install" | "runtime" }).contextBucket = "runtime";
    expect(compoundBonusFor(findings)).toBe(0);
  });

  it("applies legacy (undefined contextBucket) compound bonus for pre-M4.2 findings", () => {
    const findings = [
      fWithCode("NEW_NETWORK_CALL"),
      fWithCode("NEW_CREDENTIAL_ACCESS"),
    ];
    // No contextBucket on either — legacy path.
    expect(compoundBonusFor(findings)).toBe(20);
  });
});
