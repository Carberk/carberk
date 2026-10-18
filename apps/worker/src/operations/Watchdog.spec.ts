import { describe, expect, it } from "vitest";

import { operationsConfig } from "./OperationsConfig";
import { Watchdog, type OperationsSnapshot, type ProbeState } from "./Watchdog";

describe("independent operational probes", () => {
  it("leaves activation closed and rejects malformed deployment identities", () => {
    expect(operationsConfig({}).enabled).toBe(false);
    expect(() => operationsConfig({ OPERATIONS_ENABLED: "true" })).toThrow();
    expect(() => operationsConfig({ OPERATIONS_SCOPE: "tenant:secret" })).toThrow();
  });

  it("detects an expired actual worker heartbeat without exposing its contents", async () => {
    let now = new Date("2026-10-18T00:00:00Z");
    const heartbeatAt = now.getTime();
    const published: OperationsSnapshot[] = [];
    const watchdog = new Watchdog({ heartbeat: async () => String(heartbeatAt), http: async () => "healthy",
      queueDepths: async () => [], publish: async snapshot => { published.push(snapshot); } });
    expect((await watchdog.check(now)).worker).toBe("healthy");
    now = new Date(now.getTime() + 46_000);
    expect((await watchdog.check(now)).worker).toBe("failing");
    expect(published.at(-1)?.incident?.openedAt).toBe(now.toISOString());
    expect(JSON.stringify(published)).not.toContain(String(heartbeatAt));
  });

  it("requires a continuously observed ten-minute backlog and resets on observation loss", async () => {
    let now = new Date("2026-10-18T00:00:00Z");
    let unavailable = false;
    const watchdog = new Watchdog({ heartbeat: async () => String(now.getTime()), http: async () => "healthy",
      queueDepths: async () => { if (unavailable) throw new Error("redis unavailable"); return [{ name: "video-transcode", waiting: 101 }]; }, publish: async () => undefined });
    for (let minute = 0; minute <= 10; minute++) {
      const result = await watchdog.check(now);
      expect(result.queues[0]?.sustainedBacklog).toBe(minute === 10);
      now = new Date(now.getTime() + 60_000);
    }
    unavailable = true;
    expect((await watchdog.check(now)).queues).toEqual([]);
    unavailable = false;
    now = new Date(now.getTime() + 60_000);
    expect((await watchdog.check(now)).queues[0]?.sustainedBacklog).toBe(false);
    now = new Date(now.getTime() + 600_000);
    expect((await watchdog.check(now)).queues[0]?.sustainedBacklog).toBe(false);
  });

  it("does not resolve an open outage using an unknown dependency", async () => {
    let state: ProbeState = "failing";
    const now = new Date();
    const watchdog = new Watchdog({ heartbeat: async () => String(now.getTime()), http: async () => state,
      queueDepths: async () => [], publish: async () => undefined });
    const original = await watchdog.check(now);
    state = "unknown";
    const unknown = await watchdog.check(now);
    expect(unknown.incident?.openedAt).toBe(original.incident?.openedAt);
    expect(unknown.incident?.resolvedAt).toBeNull();
    state = "healthy";
    expect((await watchdog.check(now)).incident?.resolvedAt).toBe(now.toISOString());
  });

  it("opens incidents for measured technical thresholds but rejects stale metrics", async () => {
    let now = new Date("2026-10-18T00:00:00Z");
    const snapshot = { version: 1 as const, observedAt: now.toISOString(),
      errors: { windowMs: 300_000 as const, requests: 100, technicalErrors: 6, rate: .06 as number | null },
      latency: { windowMs: 600_000 as const, requests: 100, p95UpperMs: 100 as number | null } };
    const watchdog = new Watchdog({ heartbeat: async () => String(now.getTime()), http: async () => "healthy", queueDepths: async () => [],
      technical: async () => snapshot, publish: async () => undefined });
    expect((await watchdog.check(now)).incident?.resolvedAt).toBeNull();
    snapshot.errors.rate = 0;
    snapshot.latency.p95UpperMs = 5_000;
    expect((await watchdog.check(now)).technical?.latency.p95UpperMs).toBe(5_000);
    now = new Date(now.getTime() + 46_000);
    const stale = await watchdog.check(now);
    expect(stale.technical).toBeNull();
    expect(stale.incident?.resolvedAt).toBeNull();
    snapshot.observedAt = now.toISOString(); snapshot.latency.p95UpperMs = 1_000;
    expect((await watchdog.check(now)).incident?.resolvedAt).toBe(now.toISOString());
  });
  it("opens disk/TLS incidents and does not resolve them when a monitored volume is unknown", async () => {
    const now = new Date("2026-10-18T00:00:00Z"); let state: ProbeState = "failing";
    const watchdog = new Watchdog({ heartbeat: async () => String(now.getTime()), http: async () => "healthy", queueDepths: async () => [], publish: async () => undefined,
      disk: async () => ({ state, freeRatio: state === "unknown" ? null : state === "healthy" ? .2 : .09 }), tls: async () => ({ state: "healthy", expiresAt: "2026-11-18T00:00:00Z" }) });
    expect((await watchdog.check(now)).disk).toEqual({ state: "failing", freeRatio: .09 });
    state = "unknown"; expect((await watchdog.check(now)).incident?.resolvedAt).toBeNull();
    state = "healthy"; expect((await watchdog.check(now)).incident?.resolvedAt).toBe(now.toISOString());
  });

});
