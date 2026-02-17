/**
 * Regex patterns for detecting leaked credentials in outgoing messages.
 * Each pattern targets a specific secret type to minimize false positives.
 */

export interface CredentialMatch {
  type: string;
  value: string;
  start: number;
  end: number;
}

const PATTERNS: Array<{ type: string; regex: RegExp }> = [
  // AWS
  { type: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: "aws_secret_key", regex: /\b[A-Za-z0-9/+=]{40}\b(?=.*(?:aws|secret|key))/gi },

  // GitHub
  { type: "github_pat", regex: /\bghp_[A-Za-z0-9]{36}\b/g },
  { type: "github_pat_fine", regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { type: "github_oauth", regex: /\bgho_[A-Za-z0-9]{36}\b/g },

  // GitLab
  { type: "gitlab_pat", regex: /\bglpat-[A-Za-z0-9\-_]{20,}\b/g },

  // Slack
  { type: "slack_bot_token", regex: /\bxoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}\b/g },
  { type: "slack_user_token", regex: /\bxoxp-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}\b/g },
  { type: "slack_webhook", regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g },

  // OpenAI / Anthropic / API keys
  { type: "openai_api_key", regex: /\bsk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}\b/g },
  { type: "openai_api_key_v2", regex: /\bsk-proj-[A-Za-z0-9\-_]{40,}\b/g },
  { type: "anthropic_api_key", regex: /\bsk-ant-[A-Za-z0-9\-_]{40,}\b/g },

  // Generic API key patterns (bearer tokens, etc.)
  { type: "bearer_token", regex: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/g },
  { type: "basic_auth", regex: /\bBasic\s+[A-Za-z0-9+/]+=+\b/g },

  // Private keys
  { type: "private_key", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },

  // Generic high-entropy secrets (hex or base64 strings assigned to key-like variables)
  { type: "generic_secret", regex: /(?:api[_-]?key|secret|token|password|passwd|credential)[\s]*[=:]\s*["']([A-Za-z0-9+/=\-_]{20,})["']/gi },

  // Database connection strings
  { type: "database_url", regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s"']+:[^\s"']+@[^\s"']+/g },

  // JWT tokens
  { type: "jwt_token", regex: /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]+\b/g },
];

/**
 * Scan text for credential patterns. Returns all matches found.
 */
export function scanCredentials(text: string): CredentialMatch[] {
  const matches: CredentialMatch[] = [];

  for (const { type, regex } of PATTERNS) {
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const value = match[1] ?? match[0];
      matches.push({
        type,
        value,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return matches;
}

/**
 * Redact all credential matches in the text with `[CREDENTIAL_REDACTED]`.
 */
export function redactCredentials(text: string, matches: CredentialMatch[]): string {
  if (matches.length === 0) return text;

  // Sort by position and merge overlapping
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [
    { start: sorted[0].start, end: sorted[0].end },
  ];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }

  let result = "";
  let cursor = 0;
  for (const span of merged) {
    result += text.slice(cursor, span.start);
    result += "[CREDENTIAL_REDACTED]";
    cursor = span.end;
  }
  result += text.slice(cursor);
  return result;
}
