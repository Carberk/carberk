import { Body, Header, Controller, HttpCode, Inject, Post, Req, BadRequestException, UnauthorizedException, ServiceUnavailableException, HttpException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Public } from "../../../common/public.decorator";
import { BootstrapMeasurement } from "../application/BootstrapMeasurement";
import { AcceptClientMeasurementBatch } from "../application/AcceptClientMeasurementBatch";

@Controller("api/v1/measurement")
export class MeasurementController {
 constructor(@Inject(AcceptClientMeasurementBatch) private readonly accept: AcceptClientMeasurementBatch, @Inject(BootstrapMeasurement) private readonly bootstrap: BootstrapMeasurement) {}
 @Post("bootstrap") @Public() @Header("Cache-Control", "no-store")
 async bootstrapVisit(@Body() body: unknown, @Req() request: FastifyRequest) {
  const user = (request as FastifyRequest & { user?: { sub?: unknown } }).user;
  const authorization = request.headers.authorization;
  const synthetic = request.headers["x-measurement-synthetic"];
  const associatedGuest = request.headers["x-measurement-guest"];
  const guest = typeof associatedGuest === "string" ? associatedGuest : authorization?.startsWith("Bearer mg_") ? authorization.slice(7) : undefined;
  const result = await this.bootstrap.execute(body, { ...(typeof synthetic === "string" ? { syntheticCapability: synthetic } : {}), ...(typeof user?.sub === "string" ? { authenticatedUserId: user.sub } : {}), ...(guest ? { guestCapability: guest } : {}) });
  if (result.kind === "invalid") throw new BadRequestException({ code: "INVALID_MEASUREMENT", message: "Invalid measurement request" });
  if (result.kind === "unavailable" || result.kind === "unauthorized") throw new ServiceUnavailableException({ code: "MEASUREMENT_UNAVAILABLE", message: "Measurement unavailable" });
  return result.kind === "accepted" ? result.session : { disabled: true };
 }
 @Post("erase-guest") @Public() @HttpCode(204) @Header("Cache-Control", "no-store")
 async eraseGuest(@Req() request: FastifyRequest): Promise<void> {
  const authorization = request.headers.authorization;
  const result = await this.bootstrap.eraseGuest(authorization?.startsWith("Bearer mg_") ? authorization.slice(7) : undefined);
  if (result === "unauthorized") throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Measurement authorization required" });
  if (result === "unavailable") throw new ServiceUnavailableException({ code: "MEASUREMENT_UNAVAILABLE", message: "Measurement unavailable" });
 }
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
