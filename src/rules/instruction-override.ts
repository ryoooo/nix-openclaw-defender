import type { Severity, RuleCategory } from "../types.js";
import type { Rule, RuleCheckParams, RuleFinding } from "./types.js";
import { matchPatterns } from "./match-patterns.js";

// ---------------------------------------------------------------------------
// override.ignore-previous
// ---------------------------------------------------------------------------

const ignorePreviousPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /ignore\s+(all\s+)?previous\s+instructions/gi,
    confidence: 0.9,
    detail: "Instruction to ignore previous instructions detected",
  },
  {
    regex: /disregard\s+(all\s+)?prior\b/gi,
    confidence: 0.9,
    detail: "Instruction to disregard prior context detected",
  },
  {
    regex: /forget\s+everything/gi,
    confidence: 0.9,
    detail: "Instruction to forget everything detected",
  },
];

// ---------------------------------------------------------------------------
// override.new-instructions
// ---------------------------------------------------------------------------

const newInstructionsPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /new\s+instructions\s*:/gi,
    confidence: 0.9,
    detail: "Attempt to inject new instructions",
  },
  {
    regex: /you\s+are\s+now\s+a\b/gi,
    confidence: 0.7,
    detail: "Attempt to redefine assistant identity",
  },
  {
    regex: /from\s+now\s+on\s+you\b/gi,
    confidence: 0.8,
    detail: "Attempt to set new behavioral directives",
  },
];

// ---------------------------------------------------------------------------
// override.dan-jailbreak
// ---------------------------------------------------------------------------

const danJailbreakPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /\bDAN\b/g,
    confidence: 0.85,
    detail: "DAN (Do Anything Now) jailbreak keyword detected",
  },
  {
    regex: /do\s+anything\s+now/gi,
    confidence: 0.95,
    detail: "\"Do Anything Now\" jailbreak phrase detected",
  },
  {
    regex: /developer\s+mode\s+enabled/gi,
    confidence: 0.9,
    detail: "\"Developer mode enabled\" jailbreak phrase detected",
  },
  {
    regex: /act\s+as\s+unrestricted/gi,
    confidence: 0.9,
    detail: "\"Act as unrestricted\" jailbreak phrase detected",
  },
];

// ---------------------------------------------------------------------------
// Exported rule array
// ---------------------------------------------------------------------------

export const instructionOverrideRules: Rule[] = [
  {
    id: "override.ignore-previous",
    description:
      "Detects phrases that attempt to override or erase previous system instructions (e.g. \"ignore all previous instructions\").",
    category: "instruction_override" as RuleCategory,
    severity: "high" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, ignorePreviousPatterns);
    },
  },
  {
    id: "override.new-instructions",
    description:
      "Detects phrases injecting new behavioral instructions such as \"new instructions:\", \"you are now a\", or \"from now on you\".",
    category: "instruction_override" as RuleCategory,
    severity: "high" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, newInstructionsPatterns);
    },
  },
  {
    id: "override.dan-jailbreak",
    description:
      "Detects DAN / Do Anything Now jailbreak patterns, \"developer mode enabled\", and \"act as unrestricted\" phrases.",
    category: "instruction_override" as RuleCategory,
    severity: "critical" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, danJailbreakPatterns);
    },
  },
];
