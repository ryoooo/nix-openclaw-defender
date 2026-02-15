import type { ClassifierAdapter } from "./types.js";

// TODO: Replace HTTP inference server with direct ONNX Runtime / Transformers.js
// integration once @xenova/transformers supports PromptGuard 86M natively.
// This will remove the need for a sidecar process and reduce latency.

export interface PromptGuardConfig {
  /** HTTP endpoint of the local inference server. Default: "http://localhost:8000/classify" */
  endpoint?: string;
  /** Request timeout in milliseconds. Default: 5000 */
  timeoutMs?: number;
}

export function createPromptGuardAdapter(
  config: PromptGuardConfig = {},
): ClassifierAdapter {
  const endpoint = config.endpoint ?? "http://localhost:8000/classify";
  const timeoutMs = config.timeoutMs ?? 5_000;

  return {
    model: "prompt-guard-2-86m",

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
            `PromptGuard classifier returned HTTP ${response.status}: ${await response.text()}`,
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
