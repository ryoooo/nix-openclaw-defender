// ── Severity & Action ──────────────────────────────────────────

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Action = "block" | "sanitize" | "warn" | "log";

// ── Rule categories (Layer 1) ──────────────────────────────────

export type RuleCategory =
  | "structural_injection"
  | "instruction_override"
  | "encoding_evasion"
  | "indirect_injection"
  | "social_engineering"
  | "payload_pattern";

// ── Classifier labels (Layer 2) ────────────────────────────────

export type ClassifierLabel = "benign" | "injection" | "jailbreak";

// ── Content source ─────────────────────────────────────────────

export type ContentSource =
  | "discord_message"
  | "discord_embed"
  | "discord_attachment"
  | "tool_result"
  | "web_fetch"
  | "webhook"
  | "unknown";

// ── Scan context ───────────────────────────────────────────────

export interface ScanContext {
  source: ContentSource;
  userId?: string;
  channelId?: string;
  guildId?: string;
  roles?: string[];
  messageId?: string;
}

// ── Findings (Layer 1) ─────────────────────────────────────────

export interface ScanFinding {
  layer: 1 | 2 | 3;
  ruleId: string;
  category: RuleCategory;
  severity: Severity;
  message: string;
  evidence: string;
  confidence: number;
  position?: { start: number; end: number };
}

// ── Classifier result (Layer 2) ────────────────────────────────

export interface ClassifierResult {
  label: ClassifierLabel;
  confidence: number;
  model: string;
  durationMs: number;
}

// ── LLM judgment (Layer 3) ─────────────────────────────────────

export interface LlmJudgment {
  isInjection: boolean;
  confidence: number;
  reasoning: string;
  model: string;
  durationMs: number;
}

// ── Intent–action alignment (Layer 3) ──────────────────────────

export interface IntentAlignmentResult {
  aligned: boolean;
  confidence: number;
  reasoning: string;
  userIntent: string;
  proposedAction: string;
}

// ── Aggregate scan result ──────────────────────────────────────

export interface ScanResult {
  /** Original input (only if config.includeRawInput is true) */
  input: string;
  /** Post-normalisation text used for detection */
  normalized: string;
  /** Layer 1 rule findings */
  findings: ScanFinding[];
  /** Layer 2 classifier output */
  classifierResult?: ClassifierResult;
  /** Layer 3 LLM judgment */
  llmJudgment?: LlmJudgment;
  /** Layer 3 intent–action alignment (tool-call scans only) */
  intentAlignment?: IntentAlignmentResult;
  /** Resolved action (highest severity → action mapping) */
  action: Action;
  /** Convenience flag: action === "block" */
  blocked: boolean;
  /** Present when action === "sanitize" */
  sanitized?: string;
  /** Wall-clock time for the full scan pipeline */
  durationMs: number;
  timestamp: Date;
}
