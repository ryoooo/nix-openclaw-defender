import type { Severity, RuleCategory } from "../types.js";
import type { Rule, RuleCheckParams, RuleFinding } from "./types.js";
import { matchPatterns } from "./match-patterns.js";

// ---------------------------------------------------------------------------
// structural.system-tag
// ---------------------------------------------------------------------------

const systemTagPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /<\/?system>/gi,
    confidence: 0.9,
    detail: "XML-style <system> / </system> tag detected",
  },
  {
    regex: /<\|system\|>/gi,
    confidence: 0.85,
    detail: "ChatML-style <|system|> delimiter detected",
  },
  {
    regex: /\[system\]/gi,
    confidence: 0.7,
    detail: "Bracket-style [system] tag detected",
  },
  {
    regex: /^system\s*:/gim,
    confidence: 0.8,
    detail: "\"System:\" role prefix detected",
  },
];

// ---------------------------------------------------------------------------
// structural.role-hijack
// ---------------------------------------------------------------------------

const roleHijackPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /<\/\s*user\s*>\s*<\s*system\s*>/gi,
    confidence: 0.95,
    detail: "XML role-tag hijack: closing </user> followed by <system>",
  },
  {
    regex: /<\/\s*assistant\s*>\s*<\s*system\s*>/gi,
    confidence: 0.95,
    detail: "XML role-tag hijack: closing </assistant> followed by <system>",
  },
  {
    regex: /<\/\s*user\s*>\s*<\s*assistant\s*>/gi,
    confidence: 0.95,
    detail: "XML role-tag hijack: closing </user> followed by <assistant>",
  },
];

// ---------------------------------------------------------------------------
// structural.metadata-spoof
// ---------------------------------------------------------------------------

const metadataSpoofPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /\[from:\s*system\]/gi,
    confidence: 0.85,
    detail: "OpenClaw envelope metadata forgery: [from: System]",
  },
  {
    regex: /\[timestamp:\s*[^\]]+\]/gi,
    confidence: 0.85,
    detail: "OpenClaw envelope metadata forgery: [timestamp: ...]",
  },
  {
    regex: /\[role:\s*system\]/gi,
    confidence: 0.85,
    detail: "OpenClaw envelope metadata forgery: [role: system]",
  },
  {
    regex: /\[priority:\s*\w+\]/gi,
    confidence: 0.85,
    detail: "OpenClaw envelope metadata forgery: [priority: ...]",
  },
];

// ---------------------------------------------------------------------------
// Exported rule array
// ---------------------------------------------------------------------------

export const structuralInjectionRules: Rule[] = [
  {
    id: "structural.system-tag",
    description:
      "Detects system role tags and delimiters (<system>, <|system|>, [system], System:) that may be used to inject a system-level prompt.",
    category: "structural_injection" as RuleCategory,
    severity: "high" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, systemTagPatterns);
    },
  },
  {
    id: "structural.role-hijack",
    description:
      "Detects XML role-tag injection such as </user><system> sequences used to hijack the conversation role.",
    category: "structural_injection" as RuleCategory,
    severity: "critical" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, roleHijackPatterns);
    },
  },
  {
    id: "structural.metadata-spoof",
    description:
      "Detects OpenClaw envelope metadata forgery such as [from: System] or [timestamp: ...] injected into user content.",
    category: "structural_injection" as RuleCategory,
    severity: "high" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, metadataSpoofPatterns);
    },
  },
];
