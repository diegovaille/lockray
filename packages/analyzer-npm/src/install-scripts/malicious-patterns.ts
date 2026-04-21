/**
 * Curated patterns for confirmed-malicious install scripts.
 *
 * Each pattern covers a shape seen in real npm supply-chain attacks.
 * The list is intentionally small for M2 and will grow in M4 when
 * AST-level behavioural analysis lands.
 */

export interface MaliciousPattern {
  id: string;
  description: string;
  regex: RegExp;
}

const PATTERNS: MaliciousPattern[] = [
  {
    id: "CURL_SH",
    description: "curl <url> piped directly to a shell interpreter",
    regex: /\bcurl\b[^\n|;]*\|\s*(?:sh|bash|zsh)\b/i,
  },
  {
    id: "WGET_BASH",
    description: "wget piped directly to a shell interpreter",
    regex: /\bwget\b[^\n|;]*\|\s*(?:sh|bash|zsh)\b/i,
  },
  {
    id: "ENV_EXFIL_NODE_E",
    description: "inline Node script that reads process.env and performs an http(s) request",
    regex: /node\s+-e\s+['"][\s\S]*(?:process\.env[\s\S]*(?:https?\.get|fetch\s*\(|require\(['"]https?['"]\))|(?:https?\.get|fetch\s*\(|require\(['"]https?['"]\))[\s\S]*process\.env)/,
  },
  {
    id: "BASE64_PIPE_SH",
    description: "base64-decoded content piped to a shell interpreter",
    regex: /base64\s+-d[\s\S]*?\|\s*(?:sh|bash|zsh)\b/i,
  },
  {
    id: "PWSH_IEX_WEB",
    description: "PowerShell inline Invoke-Expression of remote content",
    regex: /\b(?:powershell|pwsh)\b[\s\S]*(?:iex|Invoke-Expression)[\s\S]*(?:Invoke-WebRequest|DownloadString)/i,
  },
];

export function matchMaliciousPatterns(script: string): MaliciousPattern[] {
  return PATTERNS.filter((p) => p.regex.test(script));
}

export function listMaliciousPatternIds(): readonly string[] {
  return PATTERNS.map((p) => p.id);
}
