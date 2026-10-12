import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boot = vi.hoisted(() => ({
  createApplicationContext: vi.fn(),
  waitForMaintenance: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@nestjs/core", () => ({ NestFactory: { createApplicationContext: boot.createApplicationContext } }));
vi.mock("nestjs-pino", () => ({ Logger: Symbol("Logger") }));
// The real module wires BullMQ consumers; a stand-in proves which path builds it.
vi.mock("./app.module", () => ({ AppModule: { name: "AppModule" } }));
vi.mock("./media-conversion-maintenance", () => ({ waitForMediaConversionMaintenance: boot.waitForMaintenance }));

async function startWorker() {
  vi.resetModules();
  await import("./main");
  await vi.waitFor(() => expect(boot.waitForMaintenance.mock.calls.length + boot.log.mock.calls.length).toBeGreaterThan(0));
}

describe("worker photo conversion maintenance boot", () => {
  beforeEach(() => {
    boot.createApplicationContext.mockReset().mockResolvedValue({ get: () => ({ log: boot.log }), useLogger: vi.fn(), enableShutdownHooks: vi.fn() });
    boot.waitForMaintenance.mockReset().mockReturnValue(new Promise<void>(() => {}));
    boot.log.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("holds the container idle without a Nest application context or Bull consumers when maintenance is on", async () => {
    vi.stubEnv("PHOTO_CONVERSION_MAINTENANCE", "true");
    await startWorker();
    expect(boot.waitForMaintenance).toHaveBeenCalledOnce();
    expect(boot.createApplicationContext).not.toHaveBeenCalled();
    expect(boot.log).not.toHaveBeenCalled();
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
