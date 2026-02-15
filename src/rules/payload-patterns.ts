import type { Severity, RuleCategory } from "../types.js";
import type { Rule, RuleCheckParams, RuleFinding } from "./types.js";
import { matchPatterns } from "./match-patterns.js";

// ---------------------------------------------------------------------------
// payload.base64-instruction
//
// Looks for base64 blocks of 40+ chars that appear near decode/atob/base64
// keywords, suggesting an encoded payload with execution intent.
// ---------------------------------------------------------------------------

const BASE64_NEAR_DECODE_RE =
  /(?:decode|atob|base64)[^]{0,80}[A-Za-z0-9+/=]{40,}|[A-Za-z0-9+/=]{40,}[^]{0,80}(?:decode|atob|base64)/gi;

// ---------------------------------------------------------------------------
// payload.dangerous-commands
// ---------------------------------------------------------------------------

const dangerousCommandPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /rm\s+-rf\b/gi,
    confidence: 0.9,
    detail: "Dangerous command: rm -rf",
  },
  {
    regex: /exec\s*[.(].*command\s*=/gi,
    confidence: 0.8,
    detail: "Dangerous command: exec with command parameter",
  },
  {
    regex: /elevated\s*=\s*true/gi,
    confidence: 0.8,
    detail: "Dangerous parameter: elevated=true",
  },
  {
    regex: /delete\s+all\s+(files|data)/gi,
    confidence: 0.85,
    detail: "Dangerous instruction: delete all files/data",
  },
];

// ---------------------------------------------------------------------------
// payload.prompt-leak
// ---------------------------------------------------------------------------

const promptLeakPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /output\s+your\s+system\s+prompt/gi,
    confidence: 0.85,
    detail: "Prompt leak attempt: output your system prompt",
  },
  {
    regex: /print\s+your\s+instructions/gi,
    confidence: 0.85,
    detail: "Prompt leak attempt: print your instructions",
  },
  {
    regex: /show\s+your\s+initial\s+prompt/gi,
    confidence: 0.85,
    detail: "Prompt leak attempt: show your initial prompt",
  },
];

// ---------------------------------------------------------------------------
// Exported rule array
// ---------------------------------------------------------------------------

export const payloadPatternRules: Rule[] = [
  {
    id: "payload.base64-instruction",
    description:
      "Detects large base64-encoded blocks (40+ chars) near decode/atob/base64 keywords, suggesting an encoded payload.",
    category: "payload_pattern" as RuleCategory,
    severity: "medium" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      const findings: RuleFinding[] = [];
      BASE64_NEAR_DECODE_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = BASE64_NEAR_DECODE_RE.exec(params.normalized)) !== null) {
        findings.push({
          evidence: m[0].slice(0, 120),
          confidence: 0.6,
          detail: "Base64 block near decode keyword detected",
          position: { start: m.index, end: m.index + m[0].length },
        });
      }
      return findings;
    },
  },
  {
    id: "payload.dangerous-commands",
    description:
      "Detects dangerous system commands and parameters such as rm -rf, exec command=, elevated=true, and delete all files/data.",
    category: "payload_pattern" as RuleCategory,
    severity: "high" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, dangerousCommandPatterns);
    },
  },
  {
    id: "payload.prompt-leak",
    description:
      "Detects attempts to extract the system prompt or initial instructions from the assistant.",
    category: "payload_pattern" as RuleCategory,
    severity: "high" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, promptLeakPatterns);
    },
  },
];
