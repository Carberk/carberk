import Fastify from "fastify";

/** No application module or Socket.IO server runs while this listener owns the port. */
export function createMediaConversionMaintenanceServer() {
  const server = Fastify();
  server.get("/healthz", async () => ({ status: "ok", service: "api", maintenance: "photo-conversion", commitSha: process.env["AUTOTM_COMMIT_SHA"] ?? "unknown" }));
  server.get("/readyz", async () => ({ status: "maintenance", service: "api", maintenance: "photo-conversion", businessReady: false }));
  server.all("*", async (_request, reply) => reply.code(503).send({ code: "SERVICE_UNAVAILABLE", message: "Photo conversion maintenance is in progress" }));
  return server;
}
