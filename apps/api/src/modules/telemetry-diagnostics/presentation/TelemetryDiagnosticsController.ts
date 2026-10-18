import { Body, Controller, Header, HttpCode, HttpException, Inject, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { SyntheticDiagnosticRelay } from "../application/SyntheticDiagnosticRelay";

@Controller("api/v1/diagnostic-telemetry")
export class TelemetryDiagnosticsController {
 constructor(@Inject(SyntheticDiagnosticRelay) private readonly relay: SyntheticDiagnosticRelay) {}
 @Post("events") @HttpCode(202) @Header("Cache-Control", "no-store")
 async capture(@Req() request: FastifyRequest & { user?: { sub?: string; sid?: string } }, @Body() body: unknown): Promise<{ accepted: true }> {
  if (!request.user?.sub || !request.user.sid) throw new HttpException({ code: "FORBIDDEN" }, 403);
  const result = await this.relay.execute({ userId: request.user.sub, sessionId: request.user.sid }, body);
  if (result === "delivered") return { accepted: true };
  throw new HttpException({ code: result === "invalid" ? "DIAGNOSTIC_INVALID" : result === "rate_limited" ? "DIAGNOSTIC_CAPACITY" : "DIAGNOSTIC_UNAVAILABLE" }, result === "invalid" ? 400 : result === "rate_limited" ? 429 : result === "denied" ? 403 : 503);
 }
}
