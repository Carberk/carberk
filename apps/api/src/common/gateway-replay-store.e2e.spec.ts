import { once } from "node:events";
import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";
import { afterEach, describe, expect, it } from "vitest";

import { GATEWAY_NONCE_TTL_MS } from "./gateway-attribution";
import { GatewayReplayStore } from "./gateway-replay-store";

describe("shared gateway replay storage", () => {
  const clients: Redis[] = [];
  afterEach(() => { for (const client of clients.splice(0)) client.disconnect(); });

  it("quarantines a fresh connection and atomically rejects concurrent and restarted API replays", async () => {
    let now = 1_800_000_000_000;
    const connect = async () => {
      const client = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379");
      clients.push(client); await client.ping();
      return client;
    };
    const firstClient = await connect();
    const secondClient = await connect();
    const first = new GatewayReplayStore(firstClient, () => now);
    const second = new GatewayReplayStore(secondClient, () => now);
    const key = `carberk:gateway-proof:test:${randomUUID()}`;
    try {
      await expect(first.claim(key)).rejects.toThrow("warming");
      now += GATEWAY_NONCE_TTL_MS;
      expect((await Promise.all([first.claim(key), second.claim(key)])).sort()).toEqual([false, true]);
      const restarted = new GatewayReplayStore(await connect(), () => now);
      await expect(restarted.claim(key)).rejects.toThrow("warming");
      now += GATEWAY_NONCE_TTL_MS;
      await expect(restarted.claim(key)).resolves.toBe(false);
      const closed = once(firstClient, "close");
      firstClient.disconnect();
      await closed;
      await expect(first.claim(`${key}:other`)).rejects.toThrow("warming");
      await firstClient.connect();
      await expect(first.claim(`${key}:other`)).rejects.toThrow("warming");
    } finally { await secondClient.del(key); }
  });
});
