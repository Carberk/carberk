import { Body, Controller, HttpCode, Inject, Post, Req, BadRequestException, UnauthorizedException, ServiceUnavailableException, HttpException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Public } from "../../../common/public.decorator";
import { AcceptClientMeasurementBatch } from "../application/AcceptClientMeasurementBatch";

@Controller("api/v1/measurement")
export class MeasurementController {
 constructor(@Inject(AcceptClientMeasurementBatch) private readonly accept: AcceptClientMeasurementBatch) {}
 @Post("events") @Public() @HttpCode(204)
 async acceptEvents(@Body() body: unknown, @Req() request: FastifyRequest): Promise<void> {
  const user = (request as FastifyRequest & { user?: { sub?: unknown } }).user;
  const authorization = request.headers.authorization;
  const guest = authorization?.startsWith("Bearer mg_") ? authorization.slice(7) : undefined;
  const result = await this.accept.execute(body, { ...(typeof user?.sub === "string" ? { authenticatedUserId: user.sub } : {}), ...(guest ? { guestCapability: guest } : {}) });
  if (result === "invalid") throw new BadRequestException({ code: "INVALID_MEASUREMENT", message: "Invalid measurement batch" });
  if (result === "unauthorized") throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Measurement authorization required" });
  if (result === "unavailable") throw new ServiceUnavailableException({ code: "MEASUREMENT_UNAVAILABLE", message: "Measurement unavailable" });
  if (result === "limited") throw new HttpException({ code: "RATE_LIMITED", message: "Measurement rate limit" }, 429);
 }
}
