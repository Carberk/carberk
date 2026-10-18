import { Injectable, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

import { operationsConfig } from "./OperationsConfig";

@Injectable()
export class WorkerHeartbeat implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending = false;

  onModuleInit(): void {
    const config = operationsConfig(process.env);
    if (!config.enabled || !config.redisUrl) return;
    const redis = new Redis(config.redisUrl, {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
      connectTimeout: 1_000, commandTimeout: 1_000, retryStrategy: () => null,
    });
    // Redis failures must not terminate or hold up a core worker operation.
    redis.on("error", () => undefined);
    this.redis = redis;
    const beat = async () => {
      if (this.pending) return;
      this.pending = true;
      try {
        if (redis.status === "wait" || redis.status === "end") await redis.connect();
        await redis.set(`${config.prefix}:worker`, String(Date.now()), "PX", 45_000);
      } catch { /* Independent watchdog will mark missing/stale rather than inventing health. */ }
      finally { this.pending = false; }
    };
    void beat();
    this.timer = setInterval(() => void beat(), 15_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.redis?.disconnect();
  }
}

@Module({ providers: [WorkerHeartbeat] })
export class WorkerHeartbeatModule {}
