import Redis from "ioredis";
import { Queue } from "bullmq";
import { OperationsSchemas } from "@auto-tm/contracts";

import { AlertSink, restoreIncident } from "./AlertSink";
import { operationsConfig } from "./OperationsConfig";
import { Watchdog } from "./Watchdog";
import { DiskProbe, tlsExpiryProbe } from "./hostProbes";
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
  const disk = new DiskProbe(config.diskPath);
  const alerts = new AlertSink(config.alertSinkUrl, config.alertSinkSecret, fetch, {
    read: () => redis.get(`${config.prefix}:alert-receipt`),
    save: async transition => { await redis.set(`${config.prefix}:alert-receipt`, transition, "EX", 30 * 86_400); },
  });
  const watchdog = new Watchdog({
    restoreIncident: async () => restoreIncident(await redis.get(`${config.prefix}:incident`), new Date()),
    disk: () => disk.check(),
    tls: () => tlsExpiryProbe(config.apiHealthUrl, new Date()),
    heartbeat: () => redis.get(`${config.prefix}:worker`),
    http: target => httpProbe(target === "api" ? config.apiHealthUrl : config.collectorHealthUrl, target),
    technical: async () => {
      const raw = await redis.get(`${config.prefix}:technical`);
      if (!raw || Buffer.byteLength(raw) > 4_096) return null;
      const parsed = OperationsSchemas.TechnicalSnapshotSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    },
    queueDepths: () => Promise.all(queues.map(async queue => {
      const counts = await queue.getJobCounts("wait", "prioritized", "active");
      return { name: queue.name, waiting: (counts["wait"] ?? 0) + (counts["prioritized"] ?? 0) + (counts["active"] ?? 0) };
    })),
    publish: async snapshot => {
      if (snapshot.incident) await redis.set(`${config.prefix}:incident`, JSON.stringify(snapshot.incident), "EX", 30 * 86_400);
      await redis.set(`${config.prefix}:snapshot`, JSON.stringify(snapshot), "PX", 90_000);
      await alerts.publish(snapshot);
    },
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
