import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisOperationsSnapshot implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly key: string;
  constructor() {
    const enabled = process.env["OPERATIONS_ENABLED"] === "true";
    const scope = process.env["OPERATIONS_SCOPE"] ?? "development";
    if (!/^[a-z0-9-]{1,48}$/.test(scope)) throw new Error("Invalid operational deployment scope");
    this.key = `operations:${scope}:snapshot`;
    const redisUrl = process.env["REDIS_URL"];
    if (enabled && !redisUrl) throw new Error("Operational Redis configuration required");
    this.redis = enabled && redisUrl ? new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
      connectTimeout: 1_000, commandTimeout: 1_000, retryStrategy: () => null }) : null;
    this.redis?.on("error", () => undefined);
  }
  async read(): Promise<string | null> {
    if (!this.redis) return null;
    if (this.redis.status === "wait" || this.redis.status === "end") await this.redis.connect();
    return this.redis.get(this.key);
  }
  onModuleDestroy(): void { this.redis?.disconnect(); }
}
