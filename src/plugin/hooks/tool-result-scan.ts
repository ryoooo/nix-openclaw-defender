import type { Scanner } from "../../scanner.js";
import type { DefenderPluginConfig, OpenClawPluginApi } from "../config.js";

/**
 * Hook: `tool_result_persist` (SYNCHRONOUS)
 *
 * Scans tool results before they are persisted to conversation memory.
 * Uses scanSync() (Layer 1 only) because this hook does not support async.
 *
 * On detection:
 * - Returns modified message with sanitized content
 * - Or replaces message content with block notice
 */
export function registerToolResultScan(
  api: OpenClawPluginApi,
  scanner: Scanner,
  config: DefenderPluginConfig,
): void {
  if (!config.toolResultScan.enabled) return;

  api.on(
    "tool_result_persist",
    (
      event: {
        toolName?: string;
        toolCallId?: string;
        message: any;
        isSynthetic?: boolean;
      },
      _ctx?: any,
    ) => {
      const text = extractMessageText(event.message);
      if (!text) return;

      const scanResult = scanner.scanSync(text, { source: "tool_result" });

      if (scanResult.blocked && config.toolResultScan.blockOnCritical) {
        if (config.scanMode === "block") {
          const reason =
            `[openclaw-defender] Tool result blocked: ` +
            scanResult.findings.map((f) => f.message).join("; ");
          api.logger.warn(
            `[defender] Tool result from "${event.toolName ?? "unknown"}" blocked: ${scanResult.findings.length} finding(s)`,
          );
          return {
            message: replaceMessageText(event.message, reason),
          };
        }
        api.logger.warn(
          `[defender] Tool result from "${event.toolName ?? "unknown"}" flagged: ${scanResult.findings.length} finding(s)`,
        );
      } else if (scanResult.sanitized) {
        api.logger.info(
          `[defender] Tool result from "${event.toolName ?? "unknown"}" sanitized: ${scanResult.findings.length} finding(s)`,
        );
        return {
          message: replaceMessageText(event.message, scanResult.sanitized),
        };
      }
    },
    { priority: 100 },
  );
}

function extractMessageText(message: any): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((b: any) => b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n");
  }
  if (typeof message.text === "string") return message.text;
  return "";
}

function replaceMessageText(message: any, newText: string): any {
  if (!message) return { content: newText };
  if (typeof message.content === "string") {
    return { ...message, content: newText };
  }
  if (Array.isArray(message.content)) {
    return {
      ...message,
      content: message.content.map((b: any) =>
        b.type === "text" ? { ...b, text: newText } : b,
      ),
    };
  }
  if (typeof message.text === "string") {
    return { ...message, text: newText };
  }
  return { ...message, content: newText };
}
