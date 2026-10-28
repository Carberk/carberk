import Fastify from "fastify";

/** No application module or Socket.IO server runs while this listener owns the port. */
export function createMediaConversionMaintenanceServer() {
  const raw = process.env["STAGING_CLEAN_RESET_EXECUTOR"];
  if (raw !== undefined) {
    const refused = () => { throw new Error("Reset executor admission refused"); };
    let binding: Record<string, unknown>;
    try { binding = JSON.parse(raw) as Record<string, unknown>; } catch { return refused(); }
    const fields = ["operationId", "reservationId", "candidate", "closureGeneration", "projectId", "environmentId", "serviceId"];
    if (!binding || typeof binding !== "object" || Array.isArray(binding) || Object.keys(binding).sort().join() !== [...fields].sort().join() ||
      ["operationId", "reservationId", "closureGeneration"].some(key => typeof binding[key] !== "string" || !/^[a-f0-9]{32}$/.test(binding[key] as string)) ||
      typeof binding["candidate"] !== "string" || !/^[a-f0-9]{40}$/.test(binding["candidate"]) ||
      process.env["PHOTO_CONVERSION_MAINTENANCE"] !== "true" || process.env["APP_ENV"] !== "staging" ||
      binding["candidate"] !== process.env["AUTOTM_COMMIT_SHA"] ||
      binding["projectId"] !== "176ddec0-dd65-4087-b82c-798599fc2ebe" || binding["projectId"] !== process.env["RAILWAY_PROJECT_ID"] ||
      binding["environmentId"] !== "652abc79-fdb0-48b0-9f6c-ad0ff572d7b2" || binding["environmentId"] !== process.env["RAILWAY_ENVIRONMENT_ID"] ||
      binding["serviceId"] !== "6db6f1b1-5c7a-4033-88d0-53f5f315bfc0" || binding["serviceId"] !== process.env["RAILWAY_SERVICE_ID"]) refused();
  }
  const server = Fastify();
  server.get("/healthz", async () => ({ status: "ok", service: "api", maintenance: "photo-conversion", commitSha: process.env["AUTOTM_COMMIT_SHA"] ?? "unknown" }));
  server.get("/readyz", async () => ({ status: "maintenance", service: "api", maintenance: "photo-conversion", businessReady: false }));
  server.all("*", async (_request, reply) => reply.code(503).send({ code: "SERVICE_UNAVAILABLE", message: "Photo conversion maintenance is in progress" }));
  return server;
}
