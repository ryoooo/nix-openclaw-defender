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
    getConfig: () => ({}),
    log: vi.fn(),
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
      content: "Here is your key: AKIAIOSFODNN7EXAMPLE",
    } as any;

    await handler(event);

    expect(event.cancel).toBe(true);
    expect(event.cancelReason).toContain("credential leak");
  });

  it("cancels message containing GitHub PAT", async () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      content: "Use this token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
    } as any;

    await handler(event);

    expect(event.cancel).toBe(true);
  });

  it("cancels message containing private key", async () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      content: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...",
    } as any;

    await handler(event);

    expect(event.cancel).toBe(true);
  });

  it("passes clean messages through", async () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      content: "Hello! Here is the weather report for today.",
    } as any;

    await handler(event);

    expect(event.cancel).toBeUndefined();
  });

  it("redacts in log mode instead of cancelling", async () => {
    const config = createDefaultPluginConfig();
    config.scanMode = "log";
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      content: "key: AKIAIOSFODNN7EXAMPLE end",
    } as any;

    await handler(event);

    expect(event.cancel).toBeUndefined();
    expect(event.content).toContain("[CREDENTIAL_REDACTED]");
    expect(event.content).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("does not register when disabled", () => {
    const config = createDefaultPluginConfig();
    config.outputGuard.enabled = false;
    const api = createMockApi();

    registerOutputGuard(api, config);

    expect(api.handlers.has("message_sending")).toBe(false);
  });

  it("handles message.content property", async () => {
    const config = createDefaultPluginConfig();
    config.scanMode = "log";
    const api = createMockApi();

    registerOutputGuard(api, config);

    const handler = api.handlers.get("message_sending")!;
    const event = {
      message: { content: "token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij" },
    } as any;

    await handler(event);

    expect(event.message.content).toContain("[CREDENTIAL_REDACTED]");
  });
});
