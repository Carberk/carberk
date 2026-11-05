import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";

import type { OtpSenderPort } from "../ports/OtpSenderPort.js";

export const sendRequestBody = z.object({
  phone: z.string().min(1),
  body: z.string().min(1),
  requestId: z.string().guid(),
});

export function sendRoutes(sender: OtpSenderPort, gatewayToken: string): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/send", async (req, reply) => {
      const token = req.headers["x-gateway-token"];
      if (!token || token !== gatewayToken) {
        return reply.status(401).send({ code: "UNAUTHORIZED" });
      }

      const parsed = sendRequestBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          code: "VALIDATION_FAILED",
          details: parsed.error.flatten(),
        });
      }

      const result = await sender.send(parsed.data);

      if (!result.ok) {
        return reply.status(502).send({ code: "SEND_FAILED", reason: result.reason });
      }

      return reply.status(202).send(result);
    });
  };
}
