import type { ScanFinding } from "../types.js";

export interface BlockResult {
  blocked: true;
  message: string;
}

/**
 * Create a block result with a human-readable message summarising the findings.
 */
export function createBlockResult(findings: ScanFinding[]): BlockResult {
  if (findings.length === 0) {
    return {
      blocked: true,
      message: "Input blocked by security policy.",
    };
  }

  const topFinding = findings.reduce((a, b) =>
    b.confidence > a.confidence ? b : a,
  );

  const ruleIds = [...new Set(findings.map((f) => f.ruleId))].join(", ");

  return {
    blocked: true,
    message: `Input blocked: ${topFinding.message} (rules: ${ruleIds}).`,
  };
}
