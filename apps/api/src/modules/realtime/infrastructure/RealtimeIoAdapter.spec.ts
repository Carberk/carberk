import { createHmac } from "node:crypto";
import http from "node:http";

import { describe, it, expect } from "vitest";
import type { INestApplicationContext } from "@nestjs/common";
import { Server } from "socket.io";
import { io } from "socket.io-client";

import { RealtimeIoAdapter } from "./RealtimeIoAdapter";

function buildAppContext(): INestApplicationContext {
  return {
    get: () => undefined,
  } as unknown as INestApplicationContext;
}

const directAttribution = { keys: {}, claimNonce: async () => false };

describe("RealtimeIoAdapter", () => {
  it("configures successfully with the Redis adapter disabled", async () => {
    const adapter = new RealtimeIoAdapter(buildAppContext(), {
      corsOrigin: "*",
      redisAdapterEnabled: false,
      redisUrl: undefined,
      gatewayAttribution: directAttribution,
    });

    await expect(adapter.configure()).resolves.toBeUndefined();
  });

  it("throws when Redis adapter is enabled without a Redis URL", async () => {
    const adapter = new RealtimeIoAdapter(buildAppContext(), {
      corsOrigin: "*",
      redisAdapterEnabled: true,
      redisUrl: undefined,
      gatewayAttribution: directAttribution,
    });

    await expect(adapter.configure()).rejects.toThrow(
      "Redis URL is required when the Socket.IO Redis adapter is enabled",
    );
  });

  it("creates a single-node Socket.IO server when Redis adapter is disabled", () => {
    const adapter = new RealtimeIoAdapter(http.createServer() as unknown as INestApplicationContext, {
      corsOrigin: "*",
      redisAdapterEnabled: false,
      redisUrl: undefined,
      gatewayAttribution: directAttribution,
    });
    const server = adapter.createIOServer(0);

    expect(server).toBeInstanceOf(Server);
    server.close();
  });

  it("refuses forged and replayed gateway proofs on Engine.IO polling requests", async () => {
    const httpServer = http.createServer();
    const claimed = new Set<string>();
    const adapter = new RealtimeIoAdapter(httpServer as unknown as INestApplicationContext, {
      corsOrigin: "*", redisAdapterEnabled: false, redisUrl: undefined,
      gatewayAttribution: {
        keys: { current: "ab".repeat(32) }, now: () => 1_800_000_000_000,
        claimNonce: async key => { if (claimed.has(key)) return false; claimed.add(key); return true; },
      },
    });
    const server = adapter.createIOServer(0);
    server.of("/ws/chat").on("connection", () => {});
    const port = await new Promise<number>(resolve => httpServer.listen(0, "127.0.0.1", () => resolve((httpServer.address() as { port: number }).port)));
    try {
      const path = "/socket.io/?EIO=4&transport=polling";
      const get = (proof?: string) => fetch(`http://127.0.0.1:${port}${path}`, { headers: proof ? { "x-carberk-client-proof": proof } : {} });
      const unsigned = `v1.current.1800000000000.${"ab".repeat(16)}.${Buffer.from("203.0.113.7").toString("base64url")}`;
      const proof = `${unsigned}.${createHmac("sha256", Buffer.from("ab".repeat(32), "hex")).update(`${unsigned}\nGET\n${path}`).digest("hex")}`;
      expect((await get("forged")).status).toBe(403);
      expect((await get(proof)).status).toBe(200);
      expect((await get(proof)).status).toBe(403);
      expect((await get()).status).toBe(200);
      const direct = io(`http://127.0.0.1:${port}/ws/chat`, { path: "/socket.io/", transports: ["websocket"], reconnection: false });
      await new Promise<void>((resolve, reject) => {
        direct.once("connect", () => resolve());
        direct.once("connect_error", reject);
      });
      direct.disconnect();
      const forged = io(`http://127.0.0.1:${port}/ws/chat`, {
        path: "/socket.io/", transports: ["websocket"], reconnection: false,
        extraHeaders: { "x-carberk-client-proof": "forged" },
      });
      await new Promise<void>((resolve, reject) => {
        forged.once("connect", () => reject(Error("Forged WebSocket connected")));
        forged.once("connect_error", () => resolve());
      });
      forged.disconnect();
    } finally {
      httpServer.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
