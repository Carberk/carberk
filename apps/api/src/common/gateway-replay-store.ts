import type { Redis } from "ioredis";

import { GATEWAY_NONCE_TTL_MS } from "./gateway-attribution";

/** Shared Redis claims survive API restarts; reconnect quarantine covers Redis data loss. */
export class GatewayReplayStore {
  private readyAfter = Number.POSITIVE_INFINITY;

  constructor(private readonly redis: Redis, private readonly now = Date.now) {
    const quarantine = () => { this.readyAfter = this.now() + GATEWAY_NONCE_TTL_MS; };
    if (redis.status === "ready") quarantine();
    redis.on("ready", quarantine);
    redis.on("close", () => { this.readyAfter = Number.POSITIVE_INFINITY; });
  }

  async claim(key: string): Promise<boolean> {
    // A lost/restarted Redis may have forgotten proofs still within freshness.
    // Let all of those expire before accepting any gateway request again.
    if (this.now() < this.readyAfter) throw new Error("Gateway replay store warming");
    return await this.redis.set(key, "1", "PX", GATEWAY_NONCE_TTL_MS, "NX") === "OK";
  }
}
