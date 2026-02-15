import type { Severity, Action } from "./types.js";
import type { Rule } from "./rules/types.js";

// ── Classifier (Layer 2) config ────────────────────────────────

export interface ClassifierConfig {
  enabled: boolean;
  adapter: "prompt-guard" | "deberta" | "api-shield" | "custom";
  /** Local model path (ONNX / Transformers) */
  modelPath?: string;
  /** Remote API endpoint */
  apiUrl?: string;
  apiKey?: string;
  /** Confidence threshold above which a non-benign label triggers action. Default: 0.8 */
  threshold: number;
  /** Custom adapter factory */
  factory?: () => unknown;
}

// ── LLM (Layer 3) config ───────────────────────────────────────

export interface LlmConfig {
  enabled: boolean;
  adapter: "cerebras" | "openai" | "anthropic" | "custom";
  apiKey?: string;
  /** Model identifier. Default: "gpt-oss-120b" */
  model: string;
  /** Base URL for the API. Default: "https://api.cerebras.ai/v1" */
  baseUrl: string;
  /** Minimum combined confidence from Layer 1+2 to trigger LLM check */
  triggerThreshold: number;
  /** LLM confidence above which the input is confirmed as injection */
  confirmThreshold: number;
  /** Timeout in ms. Default: 3000 */
  timeoutMs: number;
  /** Custom adapter factory */
  factory?: () => unknown;
}

// ── Intent alignment config ────────────────────────────────────

export interface IntentAlignmentConfig {
  enabled: boolean;
  /** Tool names that always require alignment verification */
  dangerousTools: string[];
}

// ── Top-level config ───────────────────────────────────────────

export interface DefenceConfig {
  /** Severity → action mapping */
  actions: Record<Severity, Action>;
  /** Per-rule overrides */
  rules: Record<string, { enabled?: boolean; severity?: Severity }>;
  /** Users / roles that bypass scanning */
  allowlist: { userIds: string[]; roleIds: string[] };
  /** Layer 2 */
  classifier?: Partial<ClassifierConfig>;
  /** Layer 3 */
  llm?: Partial<LlmConfig>;
  /** Intent–action alignment */
  intentAlignment?: Partial<IntentAlignmentConfig>;
  /** Extra rules appended to built-in set */
  customRules: Rule[];
  /** Max input chars to scan. Default: 10 000 */
  maxInputLength: number;
  /** Include raw input in ScanResult. Default: false */
  includeRawInput: boolean;
}

// ── Defaults ───────────────────────────────────────────────────

export function createDefaultConfig(): DefenceConfig {
  return {
    actions: {
      critical: "block",
      high: "block",
      medium: "sanitize",
      low: "warn",
      info: "log",
    },
    rules: {},
    allowlist: { userIds: [], roleIds: [] },
    classifier: undefined,
    llm: undefined,
    intentAlignment: undefined,
    customRules: [],
    maxInputLength: 10_000,
    includeRawInput: false,
  };
}

export function resolveClassifierConfig(
  partial?: Partial<ClassifierConfig>,
): ClassifierConfig | undefined {
  if (!partial?.enabled) return undefined;
  return {
    enabled: true,
    adapter: partial.adapter ?? "prompt-guard",
    modelPath: partial.modelPath,
    apiUrl: partial.apiUrl,
    apiKey: partial.apiKey,
    threshold: partial.threshold ?? 0.8,
    factory: partial.factory,
  };
}

export function resolveLlmConfig(
  partial?: Partial<LlmConfig>,
): LlmConfig | undefined {
  if (!partial?.enabled) return undefined;
  return {
    enabled: true,
    adapter: partial.adapter ?? "cerebras",
    apiKey: partial.apiKey,
    model: partial.model ?? "gpt-oss-120b",
    baseUrl: partial.baseUrl ?? "https://api.cerebras.ai/v1",
    triggerThreshold: partial.triggerThreshold ?? 0.5,
    confirmThreshold: partial.confirmThreshold ?? 0.7,
    timeoutMs: partial.timeoutMs ?? 3_000,
    factory: partial.factory,
  };
}

export function resolveIntentAlignmentConfig(
  partial?: Partial<IntentAlignmentConfig>,
): IntentAlignmentConfig | undefined {
  if (!partial?.enabled) return undefined;
  return {
    enabled: true,
    dangerousTools: partial.dangerousTools ?? [
      "exec",
      "bash",
      "shell",
      "delete",
      "rm",
      "drop",
      "send_message",
      "send_email",
    ],
  };
}

export function mergeConfig(
  base: DefenceConfig,
  overrides: Partial<DefenceConfig>,
): DefenceConfig {
  return {
    ...base,
    ...overrides,
    actions: { ...base.actions, ...overrides.actions },
    rules: { ...base.rules, ...overrides.rules },
    allowlist: {
      userIds: [
        ...base.allowlist.userIds,
        ...(overrides.allowlist?.userIds ?? []),
      ],
      roleIds: [
        ...base.allowlist.roleIds,
        ...(overrides.allowlist?.roleIds ?? []),
      ],
    },
    customRules: [
      ...base.customRules,
      ...(overrides.customRules ?? []),
    ],
  };
}
