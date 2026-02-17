import type { DefenderPluginConfig, OpenClawPluginApi } from "../config.js";
import { scanCredentials, redactCredentials } from "../utils/credential-patterns.js";

/**
 * Hook: `message_sending` (ASYNC, can cancel)
 *
 * Inspects outgoing messages for leaked credentials before they are sent.
 * Prevents accidental exfiltration of API keys, tokens, passwords, etc.
 *
 * Returns `{ cancel: true }` to prevent the message from being sent.
 */
export function registerOutputGuard(
  api: OpenClawPluginApi,
  config: DefenderPluginConfig,
): void {
  if (!config.outputGuard.enabled) return;

  api.on(
    "message_sending",
    async (event: {
      content?: string;
      text?: string;
      message?: { content?: string; text?: string };
      cancel?: boolean;
      cancelReason?: string;
    }) => {
      const text =
        event.content ??
        event.text ??
        event.message?.content ??
        event.message?.text ??
        "";

      if (!text) return;

      const matches = scanCredentials(text);
      if (matches.length === 0) return;

      const types = [...new Set(matches.map((m) => m.type))];

      if (config.outputGuard.cancelOnLeak && config.scanMode === "block") {
        event.cancel = true;
        event.cancelReason =
          `[openclaw-defender] Message cancelled: credential leak detected — ` +
          `${matches.length} credential(s) found (${types.join(", ")})`;
        api.log(
          "warn",
          `[defender] Outgoing message cancelled: ${matches.length} credential(s) (${types.join(", ")})`,
        );
      } else {
        // Log-only mode: redact credentials in-place
        const redacted = redactCredentials(text, matches);
        if (event.content !== undefined) {
          event.content = redacted;
        } else if (event.text !== undefined) {
          event.text = redacted;
        } else if (event.message) {
          if (event.message.content !== undefined) {
            event.message.content = redacted;
          } else if (event.message.text !== undefined) {
            event.message.text = redacted;
          }
        }
        api.log(
          "info",
          `[defender] Redacted ${matches.length} credential(s) in outgoing message (${types.join(", ")})`,
        );
      }
    },
    { priority: 100 },
  );
}
