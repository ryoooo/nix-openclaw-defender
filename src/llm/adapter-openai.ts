import type { LlmAdapter, LlmJudgmentRequest, LlmJudgmentResponse } from "./types.js";
import { JUDGMENT_SYSTEM_PROMPT, buildJudgmentUserMessage } from "./judgment-prompt.js";

export interface OpenAICompatibleConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

/**
 * Generic adapter for any OpenAI-compatible chat completions API.
 *
 * Works with OpenAI, Cerebras, Together, Groq, vLLM, and other providers
 * that implement the /v1/chat/completions endpoint.
 */
export function createOpenAICompatibleAdapter(
  config: OpenAICompatibleConfig,
): LlmAdapter {
  const { apiKey, model, baseUrl } = config;
  const completionsUrl = baseUrl.replace(/\/+$/, "") + "/chat/completions";

  return {
    async judge(params: LlmJudgmentRequest): Promise<LlmJudgmentResponse> {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), params.timeoutMs);

      try {
        const response = await fetch(completionsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: JUDGMENT_SYSTEM_PROMPT },
              { role: "user", content: buildJudgmentUserMessage(params) },
            ],
            temperature: 0,
            max_tokens: 512,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `OpenAI-compatible API returned HTTP ${response.status}: ${await response.text()}`,
          );
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };

        const content = data.choices[0]?.message?.content ?? "";
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
