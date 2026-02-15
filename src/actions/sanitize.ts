import type { ScanFinding } from "../types.js";

/**
 * Replace matched evidence spans in the input with `[REDACTED]`.
 *
 * Findings with position data are replaced by exact span. Findings without
 * position data fall back to a simple string replacement of the evidence text.
 * Overlapping spans are merged so that no character is redacted twice.
 */
export function sanitize(input: string, findings: ScanFinding[]): string {
  if (findings.length === 0) return input;

  // Collect spans to redact, preferring position data when available
  const spans: Array<{ start: number; end: number }> = [];

  for (const finding of findings) {
    if (finding.position) {
      spans.push({ start: finding.position.start, end: finding.position.end });
    } else if (finding.evidence) {
      // Fall back to string indexOf for findings without position
      const idx = input.indexOf(finding.evidence);
      if (idx !== -1) {
        spans.push({ start: idx, end: idx + finding.evidence.length });
      }
    }
  }

  if (spans.length === 0) return input;

  // Sort by start position, then merge overlapping
  spans.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [spans[0]];

  for (let i = 1; i < spans.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = spans[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push(curr);
    }
  }

  // Build output with redactions
  let result = "";
  let cursor = 0;

  for (const span of merged) {
    result += input.slice(cursor, span.start);
    result += "[REDACTED]";
    cursor = span.end;
  }

  result += input.slice(cursor);
  return result;
}
