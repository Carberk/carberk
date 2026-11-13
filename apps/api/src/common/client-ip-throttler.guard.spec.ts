import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ThrottlerException,
  ThrottlerStorageService,
} from "@nestjs/throttler";
import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClientIpThrottlerGuard } from "./client-ip-throttler.guard";

const EDGE_HOP = "100.64.0.9";

class Probe {
  handle(): void {}
}

function contextFor(headers: Record<string, string>): ExecutionContext {
  const req = { headers, ip: EDGE_HOP, url: "/api/v1/auth/otp/request?x=1" };
  const res = { header: () => res };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getClass: () => Probe,
    getHandler: () => Probe.prototype.handle,
  } as unknown as ExecutionContext;
}

describe("ClientIpThrottlerGuard", () => {
  const storages: ThrottlerStorageService[] = [];

  afterEach(() => {
    for (const storage of storages.splice(0)) storage.onApplicationShutdown();
    vi.restoreAllMocks();
  });

  async function guard(limit: number) {
    const storage = new ThrottlerStorageService();
    storages.push(storage);
    const instance = new ClientIpThrottlerGuard(
      [{ ttl: 60_000, limit }],
      storage,
      new Reflector(),
    );
    await instance.onModuleInit();
    return instance;
  }

  it("gives each client behind the same proxy hop its own bucket", async () => {
    const throttler = await guard(1);

    await expect(
      throttler.canActivate(contextFor({ "x-real-ip": "203.0.113.1" })),
    ).resolves.toBe(true);
    await expect(
      throttler.canActivate(contextFor({ "x-real-ip": "203.0.113.2" })),
    ).resolves.toBe(true);
    await expect(
      throttler.canActivate(contextFor({ "x-real-ip": "203.0.113.1" })),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it("counts a client that rotates X-Forwarded-For against one bucket", async () => {
    const throttler = await guard(1);
    const edge = { "x-real-ip": "203.0.113.1" };

    await expect(
      throttler.canActivate(contextFor({ ...edge, "x-forwarded-for": "1.1.1.1" })),
    ).resolves.toBe(true);
    await expect(
      throttler.canActivate(contextFor({ ...edge, "x-forwarded-for": "2.2.2.2" })),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it("warns, at most once per window, when requests arrive without the trusted header", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const throttler = await guard(10);

    await throttler.canActivate(contextFor({ "x-real-ip": "203.0.113.1" }));
    expect(warn).not.toHaveBeenCalled();

    await throttler.canActivate(contextFor({}));
    await throttler.canActivate(contextFor({ "x-real-ip": "not-an-ip" }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      event: "client_ip.peer_fallback",
      path: "/api/v1/auth/otp/request",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(EDGE_HOP);
  });
});
