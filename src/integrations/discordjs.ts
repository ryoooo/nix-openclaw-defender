import type { ScanContext, ScanResult, ContentSource } from "../types.js";
import type { Scanner } from "../scanner.js";

export interface DiscordHandlerOptions {
  /** Called when a message is blocked. */
  onBlock?: (message: any, result: ScanResult) => Promise<void>;
  /** Called when a message triggers a warning (action === "warn"). */
  onWarn?: (message: any, result: ScanResult) => Promise<void>;
  /** Called for all messages that are not blocked. Must be provided. */
  passthrough: (message: any) => Promise<void>;
}

/**
 * Create a discord.js message handler that scans incoming messages
 * before passing them through to your bot's handler.
 *
 * Uses `any` for the discord.js Message type to avoid a hard dependency
 * on discord.js. The handler reads message.content, message.embeds,
 * message.author.id, message.channelId, message.guildId, and
 * message.member?.roles?.cache.
 *
 * @example
 * ```ts
 * import { createScanner } from "openclaw-defender";
 * import { createMessageHandler } from "openclaw-defender/integrations/discordjs";
 *
 * const scanner = createScanner({ ... });
 * const handler = createMessageHandler(scanner, {
 *   onBlock: async (msg, result) => {
 *     await msg.reply("Message blocked for security reasons.");
 *   },
 *   passthrough: async (msg) => {
 *     // Your normal message handling
 *   },
 * });
 *
 * client.on("messageCreate", handler);
 * ```
 */
export function createMessageHandler(
  scanner: Scanner,
  options: DiscordHandlerOptions,
): (message: any) => Promise<void> {
  const { onBlock, onWarn, passthrough } = options;

  return async (message: any): Promise<void> => {
    // Collect all text content from the message
    const parts: string[] = [];

    // Main message content
    if (typeof message.content === "string" && message.content.length > 0) {
      parts.push(message.content);
    }

    // Embed descriptions and titles
    if (Array.isArray(message.embeds)) {
      for (const embed of message.embeds) {
        if (embed.title) parts.push(String(embed.title));
        if (embed.description) parts.push(String(embed.description));
        if (embed.footer?.text) parts.push(String(embed.footer.text));
        if (Array.isArray(embed.fields)) {
          for (const field of embed.fields) {
            if (field.name) parts.push(String(field.name));
            if (field.value) parts.push(String(field.value));
          }
        }
      }
    }

    // If no scannable content, pass through directly
    if (parts.length === 0) {
      await passthrough(message);
      return;
    }

    const input = parts.join("\n");

    // Build scan context from message metadata
    const roles: string[] = [];
    try {
      const roleCache = message.member?.roles?.cache;
      if (roleCache && typeof roleCache.map === "function") {
        roles.push(...roleCache.map((r: any) => String(r.id)));
      }
    } catch {
      // Ignore if roles are not accessible
    }

    const context: ScanContext = {
      source: "discord_message" as ContentSource,
      userId: message.author?.id ? String(message.author.id) : undefined,
      channelId: message.channelId ? String(message.channelId) : undefined,
      guildId: message.guildId ? String(message.guildId) : undefined,
      roles: roles.length > 0 ? roles : undefined,
      messageId: message.id ? String(message.id) : undefined,
    };

    const result = await scanner.scan(input, context);

    if (result.blocked) {
      if (onBlock) {
        await onBlock(message, result);
      }
      // Do not pass through blocked messages
      return;
    }

    if (result.action === "warn" && onWarn) {
      await onWarn(message, result);
    }

    await passthrough(message);
  };
}
