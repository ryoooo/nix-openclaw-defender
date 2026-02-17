import { describe, it, expect, vi } from "vitest";
import { createDefenderPlugin } from "../../src/plugin/index.js";
import type { OpenClawPluginApi } from "../../src/plugin/config.js";

function createMockApi(): OpenClawPluginApi & {
  hooks: Map<string, Function>;
  services: Map<string, any>;
  commands: Map<string, Function>;
  logs: Array<{ level: string; message: string }>;
} {
  const hooks = new Map<string, Function>();
  const services = new Map<string, any>();
  const commands = new Map<string, Function>();
  const logs: Array<{ level: string; message: string }> = [];

  return {
    hooks,
    services,
    commands,
    logs,
    on(hook: string, handler: Function) {
      hooks.set(hook, handler);
    },
    registerService(name: string, service: any) {
      services.set(name, service);
    },
    registerCommand(name: string, handler: Function) {
      commands.set(name, handler);
    },
    getConfig: () => ({}),
    log(level: string, message: string) {
      logs.push({ level, message });
    },
  };
}

describe("createDefenderPlugin", () => {
  it("returns valid plugin definition", () => {
    const plugin = createDefenderPlugin();
    expect(plugin.id).toBe("openclaw-defender");
    expect(plugin.name).toBe("OpenClaw Defender");
    expect(plugin.version).toBe("0.2.0");
    expect(typeof plugin.register).toBe("function");
  });

  it("registers all hooks with default config", async () => {
    const plugin = createDefenderPlugin();
    const api = createMockApi();

    await plugin.register(api);

    expect(api.hooks.has("tool_result_persist")).toBe(true);
    expect(api.hooks.has("before_tool_call")).toBe(true);
    expect(api.hooks.has("message_sending")).toBe(true);
  });

  it("registers services with default config", async () => {
    const plugin = createDefenderPlugin();
    const api = createMockApi();

    await plugin.register(api);

    expect(api.services.has("defender-kill-switch")).toBe(true);
    expect(api.services.has("defender-file-integrity")).toBe(true);
  });

  it("skips disabled hooks", async () => {
    const plugin = createDefenderPlugin({
      toolResultScan: { enabled: false, blockOnCritical: true },
      beforeToolCall: {
        enabled: false,
        intentAlignment: true,
        dangerousTools: [],
      },
      outputGuard: { enabled: false, cancelOnLeak: true },
    });
    const api = createMockApi();

    await plugin.register(api);

    expect(api.hooks.has("tool_result_persist")).toBe(false);
    expect(api.hooks.has("before_tool_call")).toBe(false);
    expect(api.hooks.has("message_sending")).toBe(false);
  });

  it("skips disabled services", async () => {
    const plugin = createDefenderPlugin({
      fileIntegrity: {
        enabled: false,
        watchFiles: [],
        autoRollback: false,
        checkIntervalMs: 60000,
      },
      killSwitch: { enabled: false, autoTriggerOnCritical: false },
    });
    const api = createMockApi();

    await plugin.register(api);

    expect(api.services.has("defender-kill-switch")).toBe(false);
    expect(api.services.has("defender-file-integrity")).toBe(false);
  });

  it("accepts custom scanner config", async () => {
    const plugin = createDefenderPlugin({
      scanner: { maxInputLength: 500 },
    });
    const api = createMockApi();

    await plugin.register(api);

    // Verify it registered without error
    expect(api.hooks.has("tool_result_persist")).toBe(true);
  });

  it("logs initialization info", async () => {
    const plugin = createDefenderPlugin();
    const api = createMockApi();

    await plugin.register(api);

    const infoLogs = api.logs.filter((l) => l.level === "info");
    expect(infoLogs.some((l) => l.message.includes("Initializing"))).toBe(true);
    expect(infoLogs.some((l) => l.message.includes("registered successfully"))).toBe(true);
    expect(infoLogs.some((l) => l.message.includes("Mode: block"))).toBe(true);
  });

  it("respects scanMode override", async () => {
    const plugin = createDefenderPlugin({ scanMode: "log" });
    const api = createMockApi();

    await plugin.register(api);

    expect(api.logs.some((l) => l.message.includes("Mode: log"))).toBe(true);
  });
});
