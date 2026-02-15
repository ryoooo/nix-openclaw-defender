import type { RuleCategory, Severity, ScanContext } from "../types.js";

export interface RuleCheckParams {
  /** Original input text (before normalisation) */
  original: string;
  /** Normalised input text */
  normalized: string;
  /** Optional scan context */
  context?: ScanContext;
}

export interface RuleFinding {
  /** Matched snippet (truncated to ~120 chars) */
  evidence: string;
  /** Detection confidence 0–1 */
  confidence: number;
  /** Human-readable detail */
  detail?: string;
  /** Position in normalised text */
  position?: { start: number; end: number };
}

export interface Rule {
  id: string;
  description: string;
  category: RuleCategory;
  severity: Severity;
  enabled: boolean;
  check(params: RuleCheckParams): RuleFinding[];
}
