import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { Env } from "../../../env.schema";
import type { MeasurementRateLimitPort } from "../application/AcceptClientMeasurementBatch";

export const MEASUREMENT_RATE_LIMITER = Symbol("MeasurementRateLimiter");
const SCRIPT = `local n=redis.call('INCRBY',KEYS[1],ARGV[1]); if n == tonumber(ARGV[1]) then redis.call('PEXPIRE',KEYS[1],ARGV[2]) end; return n`;
@Injectable()
export class RedisMeasurementRateLimiter implements MeasurementRateLimitPort {
  private readonly redis: Redis;
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) { this.redis = new Redis(config.get("REDIS_URL", { infer: true }) ?? "redis://localhost:6379", { maxRetriesPerRequest: 1, enableOfflineQueue: false }); }
  async consume(input: { subject: string; units: number; window: number }): Promise<boolean> {
    const key = `measurement:cap:v1:${input.window}:${input.subject}`;
    const value = Number(await this.redis.eval(SCRIPT, 1, key, input.units, 65_000));
    return value <= 120;
  }
}
