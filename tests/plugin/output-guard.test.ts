import { describe, it, expect, vi } from "vitest";
import { registerOutputGuard } from "../../src/plugin/hooks/output-guard.js";
import { createDefaultPluginConfig } from "../../src/plugin/config.js";
import type { OpenClawPluginApi } from "../../src/plugin/config.js";

function createMockApi(): OpenClawPluginApi & { handlers: Map<string, Function> } {
  const handlers = new Map<string, Function>();
  return {
    handlers,
    on(hook: string, handler: Function) {
      handlers.set(hook, handler);
    },
    registerService() {},
    registerCommand() {},
    config: {},
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe("output-guard hook", () => {
  it("cancels message containing AWS access key", async () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    expect(handler).toBeDefined();

    const event = {
      to: "user",
      content: "Here is your key: AKIAIOSFODNN7EXAMPLE",
    };

    const result = await handler(event);

    expect(result).toBeDefined();
    expect(result.cancel).toBe(true);
  });

  it("cancels message containing GitHub PAT", async () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      to: "user",
      content: "Use this token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
    };

    const result = await handler(event);

    expect(result).toBeDefined();
    expect(result.cancel).toBe(true);
  });

  it("cancels message containing private key", async () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      to: "user",
      content: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...",
    };

    const result = await handler(event);

    expect(result).toBeDefined();
    expect(result.cancel).toBe(true);
  });

  it("passes clean messages through", async () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      to: "user",
      content: "Hello! Here is the weather report for today.",
    };

    const result = await handler(event);

    expect(result).toBeUndefined();
  });

  it("redacts in log mode instead of cancelling", async () => {
    const config = createDefaultPluginConfig();
    config.scanMode = "log";
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      to: "user",
      content: "key: AKIAIOSFODNN7EXAMPLE end",
    };

    const result = await handler(event);

    expect(result).toBeDefined();
    expect(result.cancel).toBeUndefined();
    expect(result.content).toContain("[CREDENTIAL_REDACTED]");
    expect(result.content).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("does not register when disabled", () => {
    const config = createDefaultPluginConfig();
    config.outputGuard.enabled = false;
    const api = createMockApi();

    registerOutputGuard(api, config);

    expect(api.handlers.has("message_sending")).toBe(false);
  });
});
