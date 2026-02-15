import type { LlmAdapter } from "./types.js";
import { createOpenAICompatibleAdapter } from "./adapter-openai.js";

export interface CerebrasConfig {
  apiKey: string;
  /** Model identifier. Default: "llama-3.3-70b" */
  model?: string;
  /** Base URL. Default: "https://api.cerebras.ai/v1" */
  baseUrl?: string;
}

/**
 * Adapter for the Cerebras inference API.
 *
 * Cerebras exposes an OpenAI-compatible chat completions endpoint,
 * so this adapter delegates to the generic OpenAI-compatible adapter.
 * This is the DEFAULT Layer 3 adapter for openclaw-defender.
 */
export function createCerebrasAdapter(config: CerebrasConfig): LlmAdapter {
  return createOpenAICompatibleAdapter({
    apiKey: config.apiKey,
    model: config.model ?? "llama-3.3-70b",
    baseUrl: config.baseUrl ?? "https://api.cerebras.ai/v1",
  });
}
