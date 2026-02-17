import type { DefenderPluginConfig, OpenClawPluginApi } from "../config.js";
import { scanCredentials, redactCredentials } from "../utils/credential-patterns.js";

/**
 * Hook: `message_sending` (ASYNC, can cancel)
 *
 * Inspects outgoing messages for leaked credentials before they are sent.
 * Prevents accidental exfiltration of API keys, tokens, passwords, etc.
 *
 * Returns `{ cancel: true }` to prevent the message from being sent,
 * or `{ content: redacted }` to replace credentials with placeholders.
 */
export function registerOutputGuard(
  api: OpenClawPluginApi,
  config: DefenderPluginConfig,
): void {
  if (!config.outputGuard.enabled) return;

  api.on(
    "message_sending",
    async (
      event: {
        to: string;
        content: string;
        metadata?: Record<string, unknown>;
      },
      _ctx?: any,
    ) => {
      const text = event.content ?? "";
      if (!text) return;

      const matches = scanCredentials(text);
      if (matches.length === 0) return;

      const types = [...new Set(matches.map((m) => m.type))];

      if (config.outputGuard.cancelOnLeak && config.scanMode === "block") {
        api.logger.warn(
          `[defender] Outgoing message cancelled: ${matches.length} credential(s) (${types.join(", ")})`,
        );
        return { cancel: true };
      }

      // Log-only mode: redact credentials in-place
      const redacted = redactCredentials(text, matches);
      api.logger.info(
        `[defender] Redacted ${matches.length} credential(s) in outgoing message (${types.join(", ")})`,
      );
      return { content: redacted };
    },
    { priority: 100 },
  );
}
