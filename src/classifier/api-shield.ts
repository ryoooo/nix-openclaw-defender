import type { ClassifierAdapter } from "./types.js";

export interface ApiShieldConfig {
  /** Remote shield API URL (e.g. Microsoft Prompt Shields endpoint) */
  apiUrl: string;
  /** API key / bearer token */
  apiKey: string;
  /** Model name reported in results. Default: "api-shield" */
  modelName?: string;
  /** Request timeout in milliseconds. Default: 10000 */
  timeoutMs?: number;
}

/**
 * Adapter for remote API-based prompt-injection shields
 * (e.g. Microsoft Azure AI Content Safety / Prompt Shields).
 *
 * Expects the remote API to accept POST { text } and return
 * { label: "benign" | "injection" | "jailbreak", confidence: number }.
 */
export function createApiShieldAdapter(
  config: ApiShieldConfig,
): ClassifierAdapter {
  const { apiUrl, apiKey } = config;
  const modelName = config.modelName ?? "api-shield";
  const timeoutMs = config.timeoutMs ?? 10_000;

  return {
    model: modelName,

    async classify(text: string) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `API Shield returned HTTP ${response.status}: ${await response.text()}`,
          );
        }

        const result = (await response.json()) as {
          label: "benign" | "injection" | "jailbreak";
          confidence: number;
        };

        return { label: result.label, confidence: result.confidence };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
