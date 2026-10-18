import Redis from "ioredis";
import { Queue } from "bullmq";

import { operationsConfig } from "./OperationsConfig";
import { Watchdog } from "./Watchdog";
import { httpProbe } from "./httpProbe";

// This entrypoint must be deployed as a separate process/service from the core worker.
const QUEUES = ["video-transcode", "notification-fanout", "orphan-cleanup", "account-purge", "retired-upload-cleanup",
  "listing-view-retention", "measurement-retention", "measurement-outbox", "service-lifecycle", "service-push", "diagnostic-artifacts", "email-code"] as const;

async function main(): Promise<void> {
  const config = operationsConfig(process.env);
  if (!config.enabled || !config.redisUrl) return;
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
    connectTimeout: 1_000, commandTimeout: 2_000, retryStrategy: () => null,
  });
  redis.on("error", () => undefined);
  const queues = QUEUES.map(name => new Queue(name, { connection: redis }));
  const watchdog = new Watchdog({
    heartbeat: () => redis.get(`${config.prefix}:worker`),
    http: target => httpProbe(target === "api" ? config.apiHealthUrl : config.collectorHealthUrl, target),
    queueDepths: () => Promise.all(queues.map(async queue => {
      const counts = await queue.getJobCounts("wait", "prioritized", "active");
      return { name: queue.name, waiting: (counts["wait"] ?? 0) + (counts["prioritized"] ?? 0) + (counts["active"] ?? 0) };
    })),
    publish: async snapshot => { await redis.set(`${config.prefix}:snapshot`, JSON.stringify(snapshot), "PX", 90_000); },
  });
  let pending = false;
  const tick = async () => {
    if (pending) return;
    pending = true;
    try {
      if (redis.status === "wait" || redis.status === "end") await redis.connect();
      await watchdog.check(new Date());
    } catch {
      // Static output contains no endpoint, Redis error, credential or request content.
      process.stderr.write("Operational watchdog probe unavailable\n");
    } finally { pending = false; }
  };
  const timer = setInterval(() => void tick(), 30_000);
  const stop = () => {
    clearInterval(timer);
    redis.disconnect();
    void Promise.allSettled(queues.map(queue => queue.close())).finally(() => process.exit(0));
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  await tick();
}

void main().catch(() => { process.stderr.write("Operational watchdog configuration invalid\n"); process.exitCode = 1; });
