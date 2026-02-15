import type { LlmAdapter, LlmJudgmentRequest, LlmJudgmentResponse } from "./types.js";
import { JUDGMENT_SYSTEM_PROMPT, buildJudgmentUserMessage } from "./judgment-prompt.js";

export interface AnthropicConfig {
  apiKey: string;
  /** Model identifier. Default: "claude-haiku-4-5-20251001" */
  model?: string;
}

/**
 * Adapter for the Anthropic Messages API.
 *
 * Uses the native Anthropic endpoint at https://api.anthropic.com/v1/messages
 * with the x-api-key and anthropic-version headers.
 */
export function createAnthropicAdapter(config: AnthropicConfig): LlmAdapter {
  const { apiKey } = config;
  const model = config.model ?? "claude-haiku-4-5-20251001";
  const apiUrl = "https://api.anthropic.com/v1/messages";

  return {
    async judge(params: LlmJudgmentRequest): Promise<LlmJudgmentResponse> {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), params.timeoutMs);

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            system: JUDGMENT_SYSTEM_PROMPT,
            messages: [
              { role: "user", content: buildJudgmentUserMessage(params) },
            ],
            max_tokens: 512,
            temperature: 0,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Anthropic API returned HTTP ${response.status}: ${await response.text()}`,
          );
        }

        const data = (await response.json()) as {
          content: Array<{ type: string; text: string }>;
        };

        const textBlock = data.content.find((b) => b.type === "text");
        const content = textBlock?.text ?? "";
        const parsed = parseJudgmentJson(content);
        const durationMs = Date.now() - start;

        return {
          isInjection: parsed.isInjection,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
          model,
          durationMs,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function parseJudgmentJson(raw: string): {
  isInjection: boolean;
  confidence: number;
  reasoning: string;
} {
  // Extract JSON from possible markdown code fences
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

  try {
    const parsed = JSON.parse(jsonStr) as {
      isInjection?: boolean;
      confidence?: number;
      reasoning?: string;
    };
    return {
      isInjection: parsed.isInjection === true,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "No reasoning provided",
    };
  } catch {
    return {
      isInjection: false,
      confidence: 0,
      reasoning: `Failed to parse LLM response: ${raw.slice(0, 200)}`,
    };
  }
}
