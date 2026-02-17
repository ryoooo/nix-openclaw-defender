import type { Scanner } from "../../scanner.js";
import type { DefenderPluginConfig, OpenClawPluginApi } from "../config.js";

/**
 * Hook: `before_tool_call` (ASYNC, can block)
 *
 * Inspects tool call parameters before execution:
 * 1. Scans tool arguments for prompt injection patterns
 * 2. Checks intent alignment for dangerous tools (exec, bash, etc.)
 *
 * Returns `{ block: true, blockReason }` to prevent tool execution.
 */
export function registerBeforeToolCall(
  api: OpenClawPluginApi,
  scanner: Scanner,
  config: DefenderPluginConfig,
): void {
  if (!config.beforeToolCall.enabled) return;

  api.on(
    "before_tool_call",
    async (event: {
      toolName?: string;
      name?: string;
      args?: Record<string, unknown>;
      toolArgs?: Record<string, unknown>;
      userMessage?: string;
      originalMessage?: string;
      block?: boolean;
      blockReason?: string;
    }) => {
      const toolName = event.toolName ?? event.name ?? "";
      const toolArgs = event.args ?? event.toolArgs ?? {};
      const userMessage = event.userMessage ?? event.originalMessage ?? "";

      // 1. Scan serialized tool arguments for injection
      const argsText = serializeArgs(toolArgs);
      if (argsText) {
        const scanResult = await scanner.scan(argsText, {
          source: "tool_result",
        });

        if (scanResult.blocked && config.scanMode === "block") {
          event.block = true;
          event.blockReason =
            `[openclaw-defender] Tool "${toolName}" blocked: injection detected in arguments — ` +
            scanResult.findings.map((f) => f.message).join("; ");
          api.log(
            "warn",
            `[defender] Tool "${toolName}" blocked: injection in args`,
          );
          return;
        }
      }

      // 2. Intent alignment check for dangerous tools
      if (
        config.beforeToolCall.intentAlignment &&
        userMessage &&
        isDangerousTool(toolName, config.beforeToolCall.dangerousTools)
      ) {
        try {
          const alignment = await scanner.checkIntentAlignment({
            userMessage,
            toolName,
            toolArgs,
          });

          if (!alignment.aligned && alignment.confidence >= 0.7) {
            if (config.scanMode === "block") {
              event.block = true;
              event.blockReason =
                `[openclaw-defender] Tool "${toolName}" blocked: intent misalignment — ` +
                `${alignment.reasoning} (user intent: "${alignment.userIntent}", ` +
                `proposed: "${alignment.proposedAction}")`;
            }
            api.log(
              "warn",
              `[defender] Tool "${toolName}" intent misalignment (confidence: ${alignment.confidence.toFixed(2)})`,
            );
          }
        } catch {
          // If LLM is not configured, allow through
          api.log(
            "debug",
            `[defender] Intent alignment skipped for "${toolName}": no LLM configured`,
          );
        }
      }
    },
    { priority: 100 },
  );
}

function isDangerousTool(name: string, dangerousTools: string[]): boolean {
  const lower = name.toLowerCase();
  return dangerousTools.some(
    (d) => lower === d || lower.includes(d) || lower.endsWith(`_${d}`),
  );
}

function serializeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const value of Object.values(args)) {
    if (typeof value === "string") {
      parts.push(value);
    } else if (value !== null && value !== undefined) {
      parts.push(String(value));
    }
  }
  return parts.join("\n");
}
