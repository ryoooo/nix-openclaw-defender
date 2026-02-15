import type { ClassifierAdapter } from "./types.js";

export interface DeBERTaConfig {
  /** HTTP endpoint of the local inference server. Default: "http://localhost:8001/classify" */
  endpoint?: string;
  /** Request timeout in milliseconds. Default: 5000 */
  timeoutMs?: number;
}

/**
 * Adapter for the ProtectAI DeBERTa v3 prompt-injection classifier.
 *
 * The model performs binary classification (injection vs. benign).
 * We map its output to the standard ClassifierLabel union:
 *   - "injection" stays as "injection"
 *   - everything else maps to "benign"
 */
export function createDeBERTaAdapter(
  config: DeBERTaConfig = {},
): ClassifierAdapter {
  const endpoint = config.endpoint ?? "http://localhost:8001/classify";
  const timeoutMs = config.timeoutMs ?? 5_000;

  return {
    model: "deberta-v3-prompt-injection",

    async classify(text: string) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `DeBERTa classifier returned HTTP ${response.status}: ${await response.text()}`,
          );
        }

        const result = (await response.json()) as {
          label: string;
          confidence: number;
        };

        // DeBERTa outputs binary labels; map to ClassifierLabel
        const label: "benign" | "injection" | "jailbreak" =
          result.label === "injection" ? "injection" : "benign";

        return { label, confidence: result.confidence };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
