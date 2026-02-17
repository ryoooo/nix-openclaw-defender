import type { Scanner } from "../../scanner.js";
import type { DefenderPluginConfig, OpenClawPluginApi } from "../config.js";

/**
 * Hook: `tool_result_persist` (SYNCHRONOUS)
 *
 * Scans tool results before they are persisted to conversation memory.
 * Uses scanSync() (Layer 1 only) because this hook does not support async.
 *
 * On detection:
 * - Replaces text content with [REDACTED] (sanitize mode)
 * - Or blocks persistence entirely (block mode)
 */
export function registerToolResultScan(
  api: OpenClawPluginApi,
  scanner: Scanner,
  config: DefenderPluginConfig,
): void {
  if (!config.toolResultScan.enabled) return;

  api.on(
    "tool_result_persist",
    (event: {
      toolName?: string;
      result?: { text?: string; content?: string };
      blocked?: boolean;
      blockReason?: string;
    }) => {
      const text = event.result?.text ?? event.result?.content ?? "";
      if (!text) return;

      const scanResult = scanner.scanSync(text, { source: "tool_result" });

      if (scanResult.blocked && config.toolResultScan.blockOnCritical) {
        if (config.scanMode === "block") {
          event.blocked = true;
          event.blockReason =
            `[openclaw-defender] Tool result blocked: ` +
            scanResult.findings.map((f) => f.message).join("; ");
        }
        api.log(
          "warn",
          `[defender] Tool result from "${event.toolName ?? "unknown"}" blocked: ${scanResult.findings.length} finding(s)`,
        );
      } else if (scanResult.sanitized) {
        if (event.result) {
          if (event.result.text !== undefined) {
            event.result.text = scanResult.sanitized;
          }
          if (event.result.content !== undefined) {
            event.result.content = scanResult.sanitized;
          }
        }
        api.log(
          "info",
          `[defender] Tool result from "${event.toolName ?? "unknown"}" sanitized: ${scanResult.findings.length} finding(s)`,
        );
      }
    },
    { priority: 100 },
  );
}
