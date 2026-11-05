import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boot = vi.hoisted(() => ({
  createApplicationContext: vi.fn(),
  waitForMaintenance: vi.fn(),
  startMaintenanceHealthServer: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@nestjs/core", () => ({ NestFactory: { createApplicationContext: boot.createApplicationContext } }));
vi.mock("nestjs-pino", () => ({ Logger: Symbol("Logger") }));
// The normal branch only needs to prove the context is requested; a separate
// wiring spec covers the real AppModule provider graph.
vi.mock("./app.module", () => ({ AppModule: { name: "AppModule" } }));
vi.mock("./media-conversion-maintenance", () => ({ waitForMediaConversionMaintenance: boot.waitForMaintenance }));
vi.mock("./health/worker-health-server", () => ({ startMaintenanceHealthServer: boot.startMaintenanceHealthServer }));

async function startWorker(waitForBoot = true) {
  vi.resetModules();
  await import("./main");
  if (waitForBoot) {
    await vi.waitFor(() => expect(boot.waitForMaintenance.mock.calls.length + boot.log.mock.calls.length).toBeGreaterThan(0));
  }
}

describe("worker photo conversion maintenance boot", () => {
  beforeEach(() => {
    boot.createApplicationContext.mockReset().mockResolvedValue({ get: () => ({ log: boot.log }), useLogger: vi.fn(), enableShutdownHooks: vi.fn() });
    boot.waitForMaintenance.mockReset().mockReturnValue(new Promise<void>(() => {}));
    boot.startMaintenanceHealthServer.mockReset().mockResolvedValue({ close: vi.fn() });
    boot.log.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("holds the container idle without a Nest application context or Bull consumers when maintenance is on", async () => {
    vi.stubEnv("PHOTO_CONVERSION_MAINTENANCE", "true");
    vi.stubEnv("PORT", "18080");
    await startWorker();
    expect(boot.waitForMaintenance).toHaveBeenCalledOnce();
    expect(boot.startMaintenanceHealthServer).toHaveBeenCalledWith(18080);
    expect(boot.createApplicationContext).not.toHaveBeenCalled();
    expect(boot.log).not.toHaveBeenCalled();
  });

  it("uses a configured maintenance port and closes the listener when maintenance ends", async () => {
    vi.stubEnv("PHOTO_CONVERSION_MAINTENANCE", "true");
    vi.stubEnv("PORT", "8123");
    let releaseMaintenance!: () => void;
    boot.waitForMaintenance.mockReturnValueOnce(new Promise<void>((resolve) => { releaseMaintenance = resolve; }));
    const close = vi.fn((callback: () => void) => callback());
    boot.startMaintenanceHealthServer.mockResolvedValueOnce({ close });
    await startWorker();
    expect(boot.startMaintenanceHealthServer).toHaveBeenCalledWith(8123);
    releaseMaintenance();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it("rejects an invalid maintenance port", async () => {
    vi.stubEnv("PHOTO_CONVERSION_MAINTENANCE", "true");
    vi.stubEnv("PORT", "0");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await startWorker(false);
    expect(boot.startMaintenanceHealthServer).not.toHaveBeenCalled();
    expect(boot.waitForMaintenance).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
  });

  it.each([
    ["absent", undefined],
    ["false", "false"],
  ])("starts the normal application context and its consumers when maintenance is %s", async (_name, value) => {
    if (value === undefined) delete process.env["PHOTO_CONVERSION_MAINTENANCE"];
    else vi.stubEnv("PHOTO_CONVERSION_MAINTENANCE", value);
    await startWorker();
    expect(boot.waitForMaintenance).not.toHaveBeenCalled();
    expect(boot.createApplicationContext).toHaveBeenCalledOnce();
    expect(boot.createApplicationContext.mock.calls[0]?.[0]?.name).toBe("AppModule");
    expect(boot.log).toHaveBeenCalledWith("Worker started (BullMQ consumer)", "Worker");
  });
});
