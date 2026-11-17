import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { envSchema } from "./env.schema.js";
import { healthRoutes } from "./routes/health.js";
import { sendRoutes } from "./routes/send.js";
import { OtpSenderMock } from "./adapters/OtpSenderMock.js";

export function buildApp() {
  const env = envSchema.parse(process.env);

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  void app.register(helmet);
  void app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  const sender = env.OTP_DRIVER === "fleet"
    ? new OtpSenderMock()
    : new OtpSenderMock();

  void app.register(healthRoutes);
  void app.register(sendRoutes(sender, env.GATEWAY_TOKEN));

  return { app, env };
}
