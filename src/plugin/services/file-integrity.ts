import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import type { FSWatcher } from "node:fs";
import type { DefenderPluginConfig, OpenClawPluginApi, OpenClawService } from "../config.js";

export interface FileIntegrityEvent {
  file: string;
  expectedHash: string;
  actualHash: string;
  timestamp: Date;
  rolledBack: boolean;
}

/**
 * File Integrity Monitor (FIM)
 *
 * Computes SHA-256 baselines for critical files (SOUL.md, HEARTBEAT.md, etc.)
 * and monitors them for tampering via fs.watch + periodic polling.
 *
 * On tampering detection:
 * - Logs a warning
 * - Optionally auto-rollbacks from git (`git checkout -- <file>`)
 * - Fires an event for kill-switch integration
 */
export function createFileIntegrityService(
  api: OpenClawPluginApi,
  config: DefenderPluginConfig,
  opts?: {
    onTamper?: (event: FileIntegrityEvent) => void;
    workingDir?: string;
  },
): OpenClawService & {
  getBaselines(): ReadonlyMap<string, string>;
  checkNow(): Promise<FileIntegrityEvent[]>;
} {
  const baselines = new Map<string, string>();
  const watchers: FSWatcher[] = [];
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  const workingDir = opts?.workingDir ?? process.cwd();

  function sha256(content: Buffer): string {
    return createHash("sha256").update(content).digest("hex");
  }

  async function computeBaseline(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath);
      return sha256(content);
    } catch {
      return null;
    }
  }

  async function checkFile(file: string): Promise<FileIntegrityEvent | null> {
    const filePath = resolve(workingDir, file);
    const expected = baselines.get(file);
    if (!expected) return null;

    const actual = await computeBaseline(filePath);
    if (actual === null || actual === expected) return null;

    let rolledBack = false;

    if (config.fileIntegrity.autoRollback) {
      try {
        await gitCheckout(filePath, workingDir);
        // Re-verify after rollback
        const restored = await computeBaseline(filePath);
        if (restored === expected) {
          rolledBack = true;
        }
      } catch {
        api.logger.error(`[defender] FIM: Failed to rollback ${file}`);
      }
    }

    const event: FileIntegrityEvent = {
      file,
      expectedHash: expected,
      actualHash: actual,
      timestamp: new Date(),
      rolledBack,
    };

    api.logger.error(
      `[defender] FIM: Tampering detected in ${file} ` +
        `(expected: ${expected.slice(0, 12)}..., actual: ${actual.slice(0, 12)}...)` +
        (rolledBack ? " [rolled back]" : ""),
    );

    opts?.onTamper?.(event);
    return event;
  }

  async function checkAll(): Promise<FileIntegrityEvent[]> {
    const events: FileIntegrityEvent[] = [];
    for (const file of config.fileIntegrity.watchFiles) {
      const event = await checkFile(file);
      if (event) events.push(event);
    }
    return events;
  }

  return {
    id: "defender-file-integrity",

    getBaselines() {
      return baselines;
    },

    checkNow() {
      return checkAll();
    },

    async start() {
      // Compute baselines
      for (const file of config.fileIntegrity.watchFiles) {
        const filePath = resolve(workingDir, file);
        const hash = await computeBaseline(filePath);
        if (hash) {
          baselines.set(file, hash);
          api.logger.debug?.(
            `[defender] FIM: Baseline for ${file}: ${hash.slice(0, 12)}...`,
          );
        } else {
          api.logger.debug?.(`[defender] FIM: File not found, skipping: ${file}`);
        }
      }

      // Set up fs.watch for each file
      for (const file of config.fileIntegrity.watchFiles) {
        const filePath = resolve(workingDir, file);
        try {
          const watcher = watch(filePath, { persistent: false }, () => {
            // Debounce: wait a tick to let writes complete
            setTimeout(() => {
              checkFile(file);
            }, 100);
          });
          watchers.push(watcher);
        } catch {
          // File doesn't exist yet, skip watch
        }
      }

      // Periodic polling as fallback
      pollTimer = setInterval(() => {
        checkAll();
      }, config.fileIntegrity.checkIntervalMs);

      api.logger.info(
        `[defender] FIM: Monitoring ${baselines.size} file(s), polling every ${config.fileIntegrity.checkIntervalMs}ms`,
      );
    },

    stop() {
      for (const w of watchers) {
        w.close();
      }
      watchers.length = 0;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      api.logger.info("[defender] FIM: Stopped");
    },
  };
}

function gitCheckout(filePath: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", ["checkout", "--", filePath], { cwd }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
