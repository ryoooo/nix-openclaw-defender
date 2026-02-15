import type { ScanContext, ContentSource } from "../types.js";
import type { Scanner } from "../scanner.js";

/**
 * Hook descriptor that can be registered with OpenClaw's plugin system.
 *
 * Returns an object conforming to the OpenClaw plugin hook interface:
 * ```
 * { id, name, hooks: [{ event, handler }] }
 * ```
 *
 * Hooks into:
 * - "message.received": Scans incoming messages before they reach the LLM.
 *   If blocked, sets event.blocked = true and event.blockReason.
 * - "toolCall.before": Checks intent alignment for dangerous tool calls.
 *   If misaligned, sets event.blocked = true and event.blockReason.
 */
export function createOpenClawHook(scanner: Scanner): {
  id: string;
  name: string;
  hooks: Array<{ event: string; handler: (event: any) => Promise<void> }>;
} {
  return {
    id: "openclaw-defender",
    name: "OpenClaw Defender",
    hooks: [
      {
        event: "message.received",
        handler: async (event: any) => {
          const content: string =
            typeof event.content === "string"
              ? event.content
              : typeof event.message?.content === "string"
                ? event.message.content
                : "";

          if (!content) return;

          // Build context from event metadata
          const context: ScanContext = {
            source: (event.source as ContentSource) ?? "unknown",
            userId: event.userId ?? event.user?.id,
            channelId: event.channelId ?? event.channel?.id,
            guildId: event.guildId ?? event.guild?.id,
            roles: event.roles,
            messageId: event.messageId ?? event.message?.id,
          };

          const result = await scanner.scan(content, context);

          if (result.blocked) {
            event.blocked = true;
            event.blockReason = result.findings
              .map((f) => f.message)
              .join("; ");
            event.scanResult = result;
          } else if (result.sanitized) {
            // Replace content with sanitized version
            if (typeof event.content === "string") {
              event.content = result.sanitized;
            } else if (event.message && typeof event.message.content === "string") {
              event.message.content = result.sanitized;
            }
            event.scanResult = result;
          } else {
            event.scanResult = result;
          }
        },
      },
      {
        event: "toolCall.before",
        handler: async (event: any) => {
          const toolName: string = event.toolName ?? event.name ?? "";
          const toolArgs: Record<string, unknown> = event.toolArgs ?? event.args ?? {};
          const userMessage: string =
            event.userMessage ?? event.originalMessage ?? "";

          if (!toolName || !userMessage) return;

          try {
            const alignment = await scanner.checkIntentAlignment({
              userMessage,
              toolName,
              toolArgs,
            });

            event.intentAlignment = alignment;

            if (!alignment.aligned && alignment.confidence >= 0.7) {
              event.blocked = true;
              event.blockReason =
                `Intent misalignment detected: ${alignment.reasoning} ` +
                `(user intent: "${alignment.userIntent}", ` +
                `proposed: "${alignment.proposedAction}")`;
            }
          } catch {
            // If intent alignment fails (e.g. no LLM configured), allow through
            // but note the error in the event
            event.intentAlignmentError =
              "Intent alignment check failed; tool call allowed by default.";
          }
        },
      },
    ],
  };
}
