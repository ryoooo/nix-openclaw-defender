import type { Scanner } from "../../scanner.js";
import type { DefenderPluginConfig, OpenClawPluginApi } from "../config.js";

/**
 * Hook: `before_tool_call` (ASYNC, can block)
 *
 * Inspects tool call parameters before execution:
 * 0. Blocks writes to protected files (SOUL.md, HEARTBEAT.md, etc.)
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
    async (
      event: {
        toolName: string;
        params: Record<string, unknown>;
      },
      _ctx?: any,
    ) => {
      const toolName = event.toolName ?? "";
      const toolArgs = event.params ?? {};

      // 0. Protected file write guard
      const protectedHit = checkProtectedFileWrite(
        toolName,
        toolArgs,
        config.beforeToolCall.writeTools,
        config.beforeToolCall.protectedFiles,
      );
      if (protectedHit) {
        if (config.scanMode === "block") {
          api.logger.warn(
            `[defender] Tool "${toolName}" blocked: write to protected file "${protectedHit}"`,
          );
          return {
            block: true,
            blockReason:
              `[openclaw-defender] Tool "${toolName}" blocked: ` +
              `write to protected file "${protectedHit}" is not allowed. ` +
              `Protected files: ${config.beforeToolCall.protectedFiles.join(", ")}`,
          };
        }
        api.logger.warn(
          `[defender] Tool "${toolName}" flagged: write to protected file "${protectedHit}" (log mode)`,
        );
      }

      // 1. Scan serialized tool arguments for injection
      const argsText = serializeArgs(toolArgs);
      if (argsText) {
        const scanResult = await scanner.scan(argsText, {
          source: "tool_result",
        });

        if (scanResult.blocked && config.scanMode === "block") {
          api.logger.warn(
            `[defender] Tool "${toolName}" blocked: injection in args`,
          );
          return {
            block: true,
            blockReason:
              `[openclaw-defender] Tool "${toolName}" blocked: injection detected in arguments — ` +
              scanResult.findings.map((f) => f.message).join("; "),
          };
        }
      }

      // 2. Intent alignment check for dangerous tools
      if (
        config.beforeToolCall.intentAlignment &&
        isDangerousTool(toolName, config.beforeToolCall.dangerousTools)
      ) {
        try {
          const alignment = await scanner.checkIntentAlignment({
            userMessage: "",
            toolName,
            toolArgs,
          });

          if (!alignment.aligned && alignment.confidence >= 0.7) {
            if (config.scanMode === "block") {
              api.logger.warn(
                `[defender] Tool "${toolName}" intent misalignment (confidence: ${alignment.confidence.toFixed(2)})`,
              );
              return {
                block: true,
                blockReason:
                  `[openclaw-defender] Tool "${toolName}" blocked: intent misalignment — ` +
                  `${alignment.reasoning} (user intent: "${alignment.userIntent}", ` +
                  `proposed: "${alignment.proposedAction}")`,
              };
            }
            api.logger.warn(
              `[defender] Tool "${toolName}" intent misalignment (confidence: ${alignment.confidence.toFixed(2)})`,
            );
          }
        } catch {
          // If LLM is not configured, allow through
          api.logger.debug?.(
            `[defender] Intent alignment skipped for "${toolName}": no LLM configured`,
          );
        }
      }
    },
    { priority: 100 },
  );
}

/**
 * Check if a tool call targets a protected file.
 * Returns the matched filename or null.
 */
function checkProtectedFileWrite(
  toolName: string,
  args: Record<string, unknown>,
  writeTools: string[],
  protectedFiles: string[],
): string | null {
  const lower = toolName.toLowerCase();
  const isWriteTool = writeTools.some(
    (w) => lower === w || lower.includes(w) || lower.endsWith(`_${w}`),
  );
  if (!isWriteTool) return null;

  // Check all string values in args for protected file paths
  for (const value of Object.values(args)) {
    if (typeof value !== "string") continue;
    for (const pf of protectedFiles) {
      const pfLower = pf.toLowerCase();
      const valLower = value.toLowerCase();
      // Match exact filename or path ending with the filename
      if (
        valLower === pfLower ||
        valLower.endsWith(`/${pfLower}`) ||
        valLower.endsWith(`\\${pfLower}`)
      ) {
        return pf;
      }
    }
  }
  return null;
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
