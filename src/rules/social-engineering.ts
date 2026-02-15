import type { Severity, RuleCategory } from "../types.js";
import type { Rule, RuleCheckParams, RuleFinding } from "./types.js";
import { matchPatterns } from "./match-patterns.js";

// ---------------------------------------------------------------------------
// social.developer-mode
// ---------------------------------------------------------------------------

const developerModePatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /enable\s+developer\s+mode/gi,
    confidence: 0.85,
    detail: "Social engineering: request to enable developer mode",
  },
  {
    regex: /debug\s+mode\s+activated/gi,
    confidence: 0.8,
    detail: "Social engineering: claim that debug mode is activated",
  },
  {
    regex: /i\s+am\s+the\s+(developer|admin)/gi,
    confidence: 0.75,
    detail: "Social engineering: false claim of developer/admin identity",
  },
];

// ---------------------------------------------------------------------------
// social.urgency-manipulation
//
// Requires BOTH an urgency keyword/phrase AND an instruction-override keyword
// to fire, reducing false positives on benign urgent messages.
// ---------------------------------------------------------------------------

const URGENCY_RE =
  /\b(urgent|emergency|critical\s+situation|lives?\s+at\s+stake|immediately|right\s+now|time[- ]sensitive)\b/gi;

const OVERRIDE_RE =
  /\b(ignore|bypass|disable\s+security|override|skip\s+safety|turn\s+off\s+filter)/gi;

// ---------------------------------------------------------------------------
// Exported rule array
// ---------------------------------------------------------------------------

export const socialEngineeringRules: Rule[] = [
  {
    id: "social.developer-mode",
    description:
      "Detects social-engineering attempts to claim developer/admin status or enable privileged modes.",
    category: "social_engineering" as RuleCategory,
    severity: "high" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, developerModePatterns);
    },
  },
  {
    id: "social.urgency-manipulation",
    description:
      "Detects urgency language combined with instruction-override keywords, a common social-engineering tactic.",
    category: "social_engineering" as RuleCategory,
    severity: "medium" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      const text = params.normalized;
      const findings: RuleFinding[] = [];

      // Collect urgency matches
      URGENCY_RE.lastIndex = 0;
      const urgencyMatches: RegExpExecArray[] = [];
      let um: RegExpExecArray | null;
      while ((um = URGENCY_RE.exec(text)) !== null) {
        urgencyMatches.push(um);
      }
      if (urgencyMatches.length === 0) return findings;

      // Collect override matches
      OVERRIDE_RE.lastIndex = 0;
      const overrideMatches: RegExpExecArray[] = [];
      let om: RegExpExecArray | null;
      while ((om = OVERRIDE_RE.exec(text)) !== null) {
        overrideMatches.push(om);
      }
      if (overrideMatches.length === 0) return findings;

      // Both present: emit a finding for each override match, citing the
      // urgency context that makes it suspicious.
      for (const overrideMatch of overrideMatches) {
        const urgencySnippet = urgencyMatches[0][0];
        const combined = `${urgencySnippet} ... ${overrideMatch[0]}`;
        findings.push({
          evidence: combined.slice(0, 120),
          confidence: 0.7,
          detail: `Urgency phrase "${urgencySnippet}" combined with override keyword "${overrideMatch[0]}"`,
          position: {
            start: overrideMatch.index,
            end: overrideMatch.index + overrideMatch[0].length,
          },
        });
      }

      return findings;
    },
  },
];
