import { BadRequestException, Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ErrorCode, ListingVideoTelemetrySchemas } from "@auto-tm/contracts";

import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import {
  LISTING_VIDEO_TELEMETRY_PORT,
  type ListingVideoTelemetryPort,
} from "../domain/ports/ListingVideoTelemetryPort";

type AuthenticatedRequest = FastifyRequest & { user?: { sub?: string } };

/**
 * Tester measurements for Listing video (#1052): preparation, upload
 * interruptions and playback start/buffering. Only video testers are
 * recorded; everyone else gets the same 204 so the lists stay private.
 */
@Controller("api/v1/listings/video-telemetry")
export class VideoTelemetryController {
  constructor(
    @Inject(ConfigListingVideoAccess) private readonly access: ConfigListingVideoAccess,
    @Inject(LISTING_VIDEO_TELEMETRY_PORT) private readonly telemetry: ListingVideoTelemetryPort,
  ) {}

  @Post()
  @HttpCode(204)
  record(@Body() body: unknown, @Req() req: FastifyRequest): void {
    const parsed = ListingVideoTelemetrySchemas.ListingVideoTelemetryEventSchema.safeParse(body);
    if (!parsed.success) {
      // Name the refused fields only; their values may be the very URL or
      // token this contract keeps out of logs.
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: "Request validation failed",
        details: {
          fields: [...new Set(parsed.error.issues.flatMap((issue) =>
            issue.code === "unrecognized_keys" ? issue.keys : [issue.path.join(".") || "event"]))],
        },
      });
    }
    const userId = (req as AuthenticatedRequest).user?.sub ?? "";
    if (!this.access.canResumeVideo(userId) && !this.access.canViewVideo(userId)) return;
    this.telemetry.record(parsed.data);
  }
}
