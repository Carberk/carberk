import { describe, expect, it, vi } from "vitest";

import { createMediaConversionMaintenanceServer } from "./media-conversion-maintenance";

describe("photo conversion maintenance", () => {
  it("admits only an exact staging reset executor and refuses malformed binding before serving", async () => {
    const binding = { operationId: "1".repeat(32), reservationId: "2".repeat(32), candidate: "a".repeat(40), closureGeneration: "3".repeat(32),
      projectId: "176ddec0-dd65-4087-b82c-798599fc2ebe", environmentId: "652abc79-fdb0-48b0-9f6c-ad0ff572d7b2",
      serviceId: "6db6f1b1-5c7a-4033-88d0-53f5f315bfc0" };
    const env = { APP_ENV: "staging", PHOTO_CONVERSION_MAINTENANCE: "true", AUTOTM_COMMIT_SHA: binding.candidate,
      RAILWAY_PROJECT_ID: binding.projectId, RAILWAY_ENVIRONMENT_ID: binding.environmentId, RAILWAY_SERVICE_ID: binding.serviceId,
      STAGING_CLEAN_RESET_EXECUTOR: JSON.stringify(binding) };
    // The maintained server is the public boundary, not a test-only parser.
    for (const change of [
      { APP_ENV: "production" }, { PHOTO_CONVERSION_MAINTENANCE: "false" }, { AUTOTM_COMMIT_SHA: "b".repeat(40) },
      { RAILWAY_SERVICE_ID: "other" }, { STAGING_CLEAN_RESET_EXECUTOR: "{}" },
      { STAGING_CLEAN_RESET_EXECUTOR: JSON.stringify({ ...binding, proof: true }) },
    ]) {
      try {
        for (const [key, value] of Object.entries({ ...env, ...change })) vi.stubEnv(key, value);
        expect(() => createMediaConversionMaintenanceServer()).toThrow("Reset executor admission refused");
      } finally { vi.unstubAllEnvs(); }
    }
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const server = createMediaConversionMaintenanceServer();
    try {
      expect((await server.inject({ method: "GET", url: "/healthz" })).json()).toMatchObject({ commitSha: binding.candidate });
      expect((await server.inject({ method: "POST", url: "/api/v1/auth/sign-in" })).statusCode).toBe(503);
      expect((await server.inject({ method: "POST", url: "/operator/reset" })).statusCode).toBe(503);
    } finally { await server.close(); vi.unstubAllEnvs(); }
  });
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
