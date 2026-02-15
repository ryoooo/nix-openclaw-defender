import type { Severity, RuleCategory } from "../types.js";
import type { Rule, RuleCheckParams, RuleFinding } from "./types.js";
import { matchPatterns } from "./match-patterns.js";

// ---------------------------------------------------------------------------
// indirect.boundary-escape
// ---------------------------------------------------------------------------

const boundaryEscapePatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /<<<\s*END_EXTERNAL_UNTRUSTED_CONTENT\s*>>>/gi,
    confidence: 0.95,
    detail: "Boundary escape: <<<END_EXTERNAL_UNTRUSTED_CONTENT>>> marker detected",
  },
  {
    regex: /<<<\s*EXTERNAL_UNTRUSTED/gi,
    confidence: 0.9,
    detail: "Boundary escape: <<<EXTERNAL_UNTRUSTED marker detected",
  },
  {
    regex: /\[\/INST\]/gi,
    confidence: 0.9,
    detail: "Boundary escape: [/INST] delimiter detected",
  },
  {
    regex: /<\|im_end\|>/gi,
    confidence: 0.9,
    detail: "Boundary escape: <|im_end|> ChatML delimiter detected",
  },
  {
    regex: /<\|im_start\|>\s*system/gi,
    confidence: 0.95,
    detail: "Boundary escape: <|im_start|>system ChatML injection detected",
  },
];

// ---------------------------------------------------------------------------
// indirect.tool-result-injection
// ---------------------------------------------------------------------------

const toolResultPatterns: Array<{ regex: RegExp; confidence: number; detail?: string }> = [
  {
    regex: /^assistant\s*:/gim,
    confidence: 0.7,
    detail: "Content mimics assistant role prefix",
  },
  {
    regex: /<\/?function_call>/gi,
    confidence: 0.7,
    detail: "Content mimics function_call XML tags",
  },
  {
    regex: /<\/?tool_call>/gi,
    confidence: 0.7,
    detail: "Content mimics tool_call XML tags",
  },
  {
    regex: /<\/?tool_result>/gi,
    confidence: 0.7,
    detail: "Content mimics tool_result XML tags",
  },
  {
    regex: /\{"?function"?\s*:\s*"/gi,
    confidence: 0.7,
    detail: "Content mimics JSON function call format",
  },
];

/** Sources that get a confidence boost because external content is untrusted */
const BOOSTED_SOURCES = new Set(["tool_result", "web_fetch"]);
const SOURCE_BOOST = 0.15;

// ---------------------------------------------------------------------------
// Exported rule array
// ---------------------------------------------------------------------------

export const indirectInjectionRules: Rule[] = [
  {
    id: "indirect.boundary-escape",
    description:
      "Detects prompt boundary escape sequences such as <<<END_EXTERNAL_UNTRUSTED_CONTENT>>>, [/INST], and ChatML delimiters.",
    category: "indirect_injection" as RuleCategory,
    severity: "critical" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      return matchPatterns(params.normalized, boundaryEscapePatterns);
    },
  },
  {
    id: "indirect.tool-result-injection",
    description:
      "Detects content mimicking assistant responses or tool calls. Confidence is boosted when the content source is tool_result or web_fetch.",
    category: "indirect_injection" as RuleCategory,
    severity: "high" as Severity,
    enabled: true,
    check(params: RuleCheckParams): RuleFinding[] {
      const findings = matchPatterns(params.normalized, toolResultPatterns);

      // Boost confidence when content comes from an untrusted external source
      if (params.context?.source && BOOSTED_SOURCES.has(params.context.source)) {
        for (const f of findings) {
          f.confidence = Math.min(1, f.confidence + SOURCE_BOOST);
          f.detail = `${f.detail ?? ""} [boosted: source=${params.context.source}]`.trim();
        }
      }

      return findings;
    },
  },
];
