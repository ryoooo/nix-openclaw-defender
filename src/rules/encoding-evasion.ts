import type { Severity, RuleCategory } from "../types.js";
import type { Rule, RuleCheckParams, RuleFinding } from "./types.js";

// ---------------------------------------------------------------------------
// encoding.zero-width
//
// Zero-width characters: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ),
// U+2060 (WJ), U+FEFF (BOM / ZWNBSP).
// Operates on the ORIGINAL (pre-normalisation) text so that stripped chars
// are still visible.
// ---------------------------------------------------------------------------

const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u2060\uFEFF]{3,}/g;

// ---------------------------------------------------------------------------
// encoding.fullwidth
//
// Fullwidth ASCII range: U+FF01 – U+FF5E (corresponds to ! – ~).
// 3+ consecutive fullwidth chars are suspicious.
// ---------------------------------------------------------------------------

const FULLWIDTH_RE = /[\uFF01-\uFF5E]{3,}/g;

// ---------------------------------------------------------------------------
// encoding.homoglyph
//
// Detects words that mix Latin (basic + extended) and Cyrillic characters,
// a common homoglyph obfuscation technique.
// ---------------------------------------------------------------------------

const MIXED_SCRIPT_WORD_RE = /\b(?=[^\s]*[A-Za-z\u00C0-\u024F])(?=[^\s]*[\u0400-\u04FF])[^\s]+\b/g;

// ---------------------------------------------------------------------------
// Exported rule array
// ---------------------------------------------------------------------------

export const encodingEvasionRules: Rule[] = [
  {
    id: "encoding.zero-width",
    description:
      "Detects clusters of 3 or more zero-width characters in the original input, which may hide injected text.",
    category: "encoding_evasion" as RuleCategory,
    severity: "medium" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      const findings: RuleFinding[] = [];
      ZERO_WIDTH_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ZERO_WIDTH_RE.exec(params.original)) !== null) {
        const len = m[0].length;
        // Scale confidence with cluster size: 3 chars -> 0.6, 10+ chars -> 0.8
        const confidence = Math.min(0.8, 0.6 + (len - 3) * 0.03);
        findings.push({
          evidence: `[${len} zero-width characters]`,
          confidence,
          detail: `Cluster of ${len} zero-width characters detected`,
          position: { start: m.index, end: m.index + len },
        });
      }
      return findings;
    },
  },
  {
    id: "encoding.fullwidth",
    description:
      "Detects clusters of 3 or more fullwidth ASCII characters that may be used to evade keyword filters.",
    category: "encoding_evasion" as RuleCategory,
    severity: "medium" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      const findings: RuleFinding[] = [];
      FULLWIDTH_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = FULLWIDTH_RE.exec(params.original)) !== null) {
        const len = m[0].length;
        const confidence = Math.min(0.7, 0.5 + (len - 3) * 0.03);
        findings.push({
          evidence: m[0].slice(0, 120),
          confidence,
          detail: `Fullwidth ASCII sequence of ${len} characters detected`,
          position: { start: m.index, end: m.index + len },
        });
      }
      return findings;
    },
  },
  {
    id: "encoding.homoglyph",
    description:
      "Detects words that mix Latin and Cyrillic scripts, a common homoglyph obfuscation technique.",
    category: "encoding_evasion" as RuleCategory,
    severity: "medium" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      const findings: RuleFinding[] = [];
      MIXED_SCRIPT_WORD_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = MIXED_SCRIPT_WORD_RE.exec(params.original)) !== null) {
        findings.push({
          evidence: m[0].slice(0, 120),
          confidence: 0.7,
          detail: "Word mixes Latin and Cyrillic characters (possible homoglyph attack)",
          position: { start: m.index, end: m.index + m[0].length },
        });
      }
      return findings;
    },
  },
];
