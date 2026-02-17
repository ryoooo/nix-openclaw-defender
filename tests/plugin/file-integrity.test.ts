import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createFileIntegrityService } from "../../src/plugin/services/file-integrity.js";
import { createDefaultPluginConfig } from "../../src/plugin/config.js";
import type { OpenClawPluginApi, OpenClawService } from "../../src/plugin/config.js";
import type { FileIntegrityEvent } from "../../src/plugin/services/file-integrity.js";

function createMockApi(): OpenClawPluginApi {
  return {
    on() {},
    registerService() {},
    registerCommand() {},
    getConfig: () => ({}),
    log: vi.fn(),
  };
}

describe("file-integrity service", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `defender-fim-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("computes baselines on start", async () => {
    await writeFile(join(testDir, "SOUL.md"), "# Soul\nDo no harm.");
    await writeFile(join(testDir, "CLAUDE.md"), "# Claude\nBe helpful.");

    const config = createDefaultPluginConfig();
    config.fileIntegrity.watchFiles = ["SOUL.md", "CLAUDE.md"];
    config.fileIntegrity.checkIntervalMs = 600_000; // Don't poll during test
    const api = createMockApi();

    const fim = createFileIntegrityService(api, config, { workingDir: testDir });
    await fim.start();

    const baselines = fim.getBaselines();
    expect(baselines.size).toBe(2);
    expect(baselines.has("SOUL.md")).toBe(true);
    expect(baselines.has("CLAUDE.md")).toBe(true);

    fim.stop();
  });

  it("detects file tampering", async () => {
    await writeFile(join(testDir, "SOUL.md"), "Original content");

    const config = createDefaultPluginConfig();
    config.fileIntegrity.watchFiles = ["SOUL.md"];
    config.fileIntegrity.checkIntervalMs = 600_000;
    const api = createMockApi();

    const tamperEvents: FileIntegrityEvent[] = [];
    const fim = createFileIntegrityService(api, config, {
      workingDir: testDir,
      onTamper(event) { tamperEvents.push(event); },
    });

    await fim.start();
    expect(fim.getBaselines().size).toBe(1);

    // Tamper with the file
    await writeFile(join(testDir, "SOUL.md"), "TAMPERED CONTENT");

    const events = await fim.checkNow();
    expect(events.length).toBe(1);
    expect(events[0].file).toBe("SOUL.md");
    expect(events[0].rolledBack).toBe(false);
    expect(tamperEvents.length).toBe(1);

    fim.stop();
  });

  it("skips missing files gracefully", async () => {
    const config = createDefaultPluginConfig();
    config.fileIntegrity.watchFiles = ["NONEXISTENT.md"];
    config.fileIntegrity.checkIntervalMs = 600_000;
    const api = createMockApi();

    const fim = createFileIntegrityService(api, config, { workingDir: testDir });
    await fim.start();

    expect(fim.getBaselines().size).toBe(0);

    const events = await fim.checkNow();
    expect(events.length).toBe(0);

    fim.stop();
  });

  it("no events when file is unchanged", async () => {
    await writeFile(join(testDir, "SOUL.md"), "Stable content");

    const config = createDefaultPluginConfig();
    config.fileIntegrity.watchFiles = ["SOUL.md"];
    config.fileIntegrity.checkIntervalMs = 600_000;
    const api = createMockApi();

    const fim = createFileIntegrityService(api, config, { workingDir: testDir });
    await fim.start();

    const events = await fim.checkNow();
    expect(events.length).toBe(0);

    fim.stop();
  });
});
