// ── Scanner (core) ────────────────────────────────────────────
export { Scanner, createScanner } from "./scanner.js";

// ── Types ─────────────────────────────────────────────────────
export type {
  Severity,
  Action,
  RuleCategory,
  ClassifierLabel,
  ContentSource,
  ScanContext,
  ScanFinding,
  ClassifierResult,
  LlmJudgment,
  IntentAlignmentResult,
  ScanResult,
} from "./types.js";

// ── Config ────────────────────────────────────────────────────
export {
  createDefaultConfig,
  resolveClassifierConfig,
  resolveLlmConfig,
  resolveIntentAlignmentConfig,
  mergeConfig,
} from "./config.js";
export type {
  ClassifierConfig,
  LlmConfig,
  IntentAlignmentConfig,
  DefenceConfig,
} from "./config.js";

// ── Normalizer ────────────────────────────────────────────────
export {
  normalize,
  stripZeroWidth,
  foldFullwidth,
  normalizeUnicode,
  countZeroWidth,
  countFullwidth,
} from "./normalizer.js";

// ── Events ────────────────────────────────────────────────────
export { DefenceEventEmitter } from "./events.js";
export type { DefenceEvents } from "./events.js";

// ── Rules ─────────────────────────────────────────────────────
export { getBuiltinRules } from "./rules/index.js";
export type { Rule, RuleCheckParams, RuleFinding } from "./rules/types.js";

// ── Classifier adapters (Layer 2) ─────────────────────────────
export type { ClassifierAdapter } from "./classifier/types.js";
export { createPromptGuardAdapter } from "./classifier/prompt-guard.js";
export type { PromptGuardConfig } from "./classifier/prompt-guard.js";
export { createDeBERTaAdapter } from "./classifier/deberta.js";
export type { DeBERTaConfig } from "./classifier/deberta.js";
export { createApiShieldAdapter } from "./classifier/api-shield.js";
export type { ApiShieldConfig } from "./classifier/api-shield.js";

// ── LLM adapters (Layer 3) ───────────────────────────────────
export type {
  LlmAdapter,
  LlmJudgmentRequest,
  LlmJudgmentResponse,
} from "./llm/types.js";
export {
  JUDGMENT_SYSTEM_PROMPT,
  buildJudgmentUserMessage,
} from "./llm/judgment-prompt.js";
export {
  INTENT_ALIGNMENT_PROMPT,
  buildIntentAlignmentMessage,
} from "./llm/intent-alignment.js";
export { createCerebrasAdapter } from "./llm/adapter-cerebras.js";
export type { CerebrasConfig } from "./llm/adapter-cerebras.js";
export { createOpenAICompatibleAdapter } from "./llm/adapter-openai.js";
export type { OpenAICompatibleConfig } from "./llm/adapter-openai.js";
export { createAnthropicAdapter } from "./llm/adapter-anthropic.js";
export type { AnthropicConfig } from "./llm/adapter-anthropic.js";

// ── Actions ───────────────────────────────────────────────────
export { resolveAction } from "./actions/index.js";
export { createBlockResult } from "./actions/block.js";
export type { BlockResult } from "./actions/block.js";
export { sanitize } from "./actions/sanitize.js";
export { wrapUntrusted } from "./actions/wrap.js";

// ── Integration modules (as namespaces) ──────────────────────
import * as generic from "./integrations/generic.js";
import * as discordjs from "./integrations/discordjs.js";
import * as openclaw from "./integrations/openclaw.js";

export const integrations = {
  generic,
  discordjs,
  openclaw,
} as const;

// ── Named integration re-exports for direct use ──────────────
export { scan, scanSync } from "./integrations/generic.js";
export { createMessageHandler } from "./integrations/discordjs.js";
export type { DiscordHandlerOptions } from "./integrations/discordjs.js";
export { createOpenClawHook } from "./integrations/openclaw.js";
