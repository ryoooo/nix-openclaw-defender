import { describe, it, expect, vi } from "vitest";
import { createKillSwitchService } from "../../src/plugin/services/kill-switch.js";
import { createDefaultPluginConfig } from "../../src/plugin/config.js";
import type { OpenClawPluginApi } from "../../src/plugin/config.js";

function createMockApi(): OpenClawPluginApi & { commands: Map<string, any> } {
  const commands = new Map<string, any>();
  return {
    commands,
    on() {},
    registerService() {},
    registerCommand(command: any) {
      commands.set(command.name, command);
    },
    config: {},
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe("kill-switch service", () => {
  it("starts in non-triggered state", () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();
    const ks = createKillSwitchService(api, config);

    expect(ks.isTriggered()).toBe(false);
    expect(ks.getState().triggered).toBe(false);
  });

  it("triggers via trigger() method", () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();
    const onKill = vi.fn();
    const ks = createKillSwitchService(api, config, { onKill });

    ks.trigger("Test reason");

    expect(ks.isTriggered()).toBe(true);
    expect(ks.getState().reason).toBe("Test reason");
    expect(ks.getState().timestamp).toBeInstanceOf(Date);
    expect(onKill).toHaveBeenCalledWith("Test reason");
  });

  it("does not re-trigger once already triggered", () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();
    const onKill = vi.fn();
    const ks = createKillSwitchService(api, config, { onKill });

    ks.trigger("First reason");
    ks.trigger("Second reason");

    expect(onKill).toHaveBeenCalledTimes(1);
    expect(ks.getState().reason).toBe("First reason");
  });

  it("registers /defender-kill command on start", () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();
    const onKill = vi.fn();
    const ks = createKillSwitchService(api, config, { onKill });

    ks.start();

    expect(api.commands.has("defender-kill")).toBe(true);

    // Simulate command execution via OpenClaw command handler
    const command = api.commands.get("defender-kill")!;
    command.handler({ args: "emergency stop", commandBody: "/defender-kill emergency stop" });

    expect(ks.isTriggered()).toBe(true);
    expect(ks.getState().reason).toBe("emergency stop");
    expect(onKill).toHaveBeenCalledWith("emergency stop");
  });

  it("uses default reason when command has no args", () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();
    const ks = createKillSwitchService(api, config);

    ks.start();

    const command = api.commands.get("defender-kill")!;
    command.handler({ args: "", commandBody: "/defender-kill" });

    expect(ks.getState().reason).toBe("Manual kill switch activation");
  });

  it("getState returns a copy (not mutable reference)", () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();
    const ks = createKillSwitchService(api, config);

    const state1 = ks.getState();
    ks.trigger("test");
    const state2 = ks.getState();

    expect(state1.triggered).toBe(false);
    expect(state2.triggered).toBe(true);
  });

  it("has correct service id", () => {
    const config = createDefaultPluginConfig();
    const api = createMockApi();
    const ks = createKillSwitchService(api, config);

    expect(ks.id).toBe("defender-kill-switch");
  });
});
