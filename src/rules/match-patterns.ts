import type { RuleFinding } from "./types.js";

/**
 * Scan `text` against an array of regex patterns and return findings with
 * positions. Each pattern can carry its own confidence and optional detail
 * string.
 */
export function matchPatterns(
  text: string,
  patterns: Array<{ regex: RegExp; confidence: number; detail?: string }>,
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  for (const { regex, confidence, detail } of patterns) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      findings.push({
        evidence: m[0].slice(0, 120),
        confidence,
        detail,
        position: { start: m.index, end: m.index + m[0].length },
      });
      if (!regex.global) break;
    }
  }
  return findings;
}
