import { describe, expect, it } from "vitest";

import { createMediaConversionMaintenanceServer } from "./media-conversion-maintenance";

describe("photo conversion maintenance", () => {
  it("keeps liveness reachable and refuses every business route and Socket.IO handshake", async () => {
    const server = createMediaConversionMaintenanceServer();
    try {
      expect((await server.inject({ method: "GET", url: "/healthz" })).json()).toMatchObject({ status: "ok", maintenance: "photo-conversion" });
      const readiness = await server.inject({ method: "GET", url: "/readyz" });
      expect(readiness.statusCode).toBe(200);
      expect(readiness.json()).toMatchObject({ status: "maintenance", businessReady: false });
      for (const [method, url] of [["POST", "/api/v1/uploads/presign"], ["POST", "/api/v1/conversations/1/messages"], ["PATCH", "/api/v1/me/profile"], ["GET", "/api/v1/listings/1"], ["GET", "/socket.io/?EIO=4&transport=polling"]] as const) {
        expect((await server.inject({ method, url })).statusCode).toBe(503);
      }
    } finally { await server.close(); }
  });
});
