import { randomUUID } from "node:crypto";

import Redis from "ioredis";
import { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { Watchdog } from "./Watchdog";
import { WorkerHeartbeat } from "./worker-heartbeat.module";

const redisUrl = process.env["REDIS_URL"] ?? "";
const hosted = process.env["GITHUB_ACTIONS"] === "true" && /^redis:\/\/(localhost|127\.0\.0\.1):\d+/.test(redisUrl);

describe.skipIf(!hosted)("Operational watchdog actual Redis and BullMQ", () => {
  it("reads a real worker heartbeat and queue backlog, publishes only bounded counts and detects worker disappearance", async () => {
    const scope = `test-${randomUUID()}`;
    const prefix = `operations:${scope}`;
    const redis = new Redis(redisUrl);
    const queue = new Queue(`ops-test-${randomUUID()}`, { connection: { url: redisUrl } });
    const heartbeat = new WorkerHeartbeat();
    vi.stubEnv("OPERATIONS_ENABLED", "true");
    vi.stubEnv("OPERATIONS_SCOPE", scope);
    try {
      await queue.add("synthetic", { private: "must-not-enter-health" });
      await queue.add("synthetic", {});
      heartbeat.onModuleInit();
      await vi.waitFor(async () => expect(await redis.get(`${prefix}:worker`)).not.toBeNull());
      expect(await redis.pttl(`${prefix}:worker`)).toBeGreaterThan(0);
      expect(await redis.pttl(`${prefix}:worker`)).toBeLessThanOrEqual(45_000);
      const watchdog = new Watchdog({ heartbeat: () => redis.get(`${prefix}:worker`), http: async () => "healthy",
        queueDepths: async () => {
          const counts = await queue.getJobCounts("wait", "prioritized", "active");
          return [{ name: "video-transcode", waiting: (counts["wait"] ?? 0) + (counts["prioritized"] ?? 0) + (counts["active"] ?? 0) }];
        },
        publish: async snapshot => { await redis.set(`${prefix}:snapshot`, JSON.stringify(snapshot), "PX", 90_000); },
      });
      const initial = await watchdog.check(new Date());
      expect(initial.worker).toBe("healthy");
      expect(initial.queues).toEqual([{ name: "video-transcode", waiting: 2, sustainedBacklog: false }]);
      expect(await redis.get(`${prefix}:snapshot`)).not.toContain("must-not-enter-health");
      expect(await redis.pttl(`${prefix}:snapshot`)).toBeGreaterThan(0);
      heartbeat.onModuleDestroy();
      await redis.del(`${prefix}:worker`);
      expect((await watchdog.check(new Date())).worker).toBe("failing");
    } finally {
      heartbeat.onModuleDestroy();
      vi.unstubAllEnvs();
      await queue.obliterate({ force: true });
      await queue.close();
      await redis.del(`${prefix}:worker`, `${prefix}:snapshot`);
      await redis.quit();
    }
  }, 15_000);
});
