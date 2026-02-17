import type { DefenderPluginConfig, OpenClawPluginApi, OpenClawService } from "../config.js";

export interface KillSwitchState {
  triggered: boolean;
  reason?: string;
  timestamp?: Date;
}

/**
 * Kill Switch
 *
 * Emergency shutdown mechanism for the agent session.
 * Can be triggered:
 * - Manually via `/defender-kill` command
 * - Automatically when critical findings are detected (if autoTriggerOnCritical is enabled)
 *
 * When triggered:
 * - Logs the reason
 * - Calls the onKill callback (can be used to stop gateway, close connections, etc.)
 * - Sets triggered state to prevent further actions
 */
export function createKillSwitchService(
  api: OpenClawPluginApi,
  config: DefenderPluginConfig,
  opts?: {
    onKill?: (reason: string) => void | Promise<void>;
  },
): OpenClawService & {
  trigger(reason: string): void;
  getState(): Readonly<KillSwitchState>;
  isTriggered(): boolean;
} {
  const state: KillSwitchState = { triggered: false };

  function trigger(reason: string): void {
    if (state.triggered) return; // Already triggered

    state.triggered = true;
    state.reason = reason;
    state.timestamp = new Date();

    api.log(
      "error",
      `[defender] KILL SWITCH TRIGGERED: ${reason}`,
    );

    try {
      opts?.onKill?.(reason);
    } catch {
      api.log("error", "[defender] Kill switch callback failed");
    }
  }

  return {
    trigger,

    getState() {
      return { ...state };
    },

    isTriggered() {
      return state.triggered;
    },

    start() {
      // Register the /defender-kill command
      api.registerCommand("defender-kill", (args: string[]) => {
        const reason = args.length > 0
          ? args.join(" ")
          : "Manual kill switch activation";
        trigger(reason);
      });

      api.log("info", "[defender] Kill switch armed. Use /defender-kill to trigger.");
    },

    stop() {
      // Nothing to clean up
      api.log("info", "[defender] Kill switch disarmed");
    },
  };
}
