import type {
  Action,
  Severity,
  ScanFinding,
  ClassifierResult,
  LlmJudgment,
} from "../types.js";
import type { DefenceConfig } from "../config.js";

/** Severity ranking — higher index means more severe. */
const SEVERITY_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];

function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

/**
 * Determine the action to take based on the highest-severity finding
 * and the config's severity-to-action mapping.
 *
 * Also considers classifier and LLM judgment results, which are mapped
 * to equivalent severities for comparison.
 */
export function resolveAction(
  config: DefenceConfig,
  findings: ScanFinding[],
  classifierResult?: ClassifierResult,
  llmJudgment?: LlmJudgment,
): Action {
  let highestSeverity: Severity = "info";

  // Check rule-based findings
  for (const finding of findings) {
    if (severityRank(finding.severity) > severityRank(highestSeverity)) {
      highestSeverity = finding.severity;
    }
  }

  // Map classifier result to severity
  if (classifierResult && classifierResult.label !== "benign") {
    const classifierSeverity = classifierConfidenceToSeverity(
      classifierResult.confidence,
    );
    if (severityRank(classifierSeverity) > severityRank(highestSeverity)) {
      highestSeverity = classifierSeverity;
    }
  }

  // Map LLM judgment to severity
  if (llmJudgment && llmJudgment.isInjection) {
    const llmSeverity = llmConfidenceToSeverity(llmJudgment.confidence);
    if (severityRank(llmSeverity) > severityRank(highestSeverity)) {
      highestSeverity = llmSeverity;
    }
  }

  return config.actions[highestSeverity];
}

function classifierConfidenceToSeverity(confidence: number): Severity {
  if (confidence >= 0.95) return "critical";
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "medium";
  if (confidence >= 0.5) return "low";
  return "info";
}

function llmConfidenceToSeverity(confidence: number): Severity {
  if (confidence >= 0.9) return "critical";
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.6) return "medium";
  if (confidence >= 0.4) return "low";
  return "info";
}
