import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { AdminSchemas, ErrorCode, VideoUploadsSchemas } from "@auto-tm/contracts";

import { IDENTITY_CHECK_PORT, type IdentityCheckPort } from "../../identity/identity.public";
import { VideoUploadSessions } from "../application/VideoUploadSessions";

type AuthenticatedRequest = FastifyRequest & { user?: { sub?: string } };

@Controller("api/v1/listings/video-uploads")
export class VideoUploadsController {
  constructor(
    @Inject(VideoUploadSessions) private readonly sessions: VideoUploadSessions,
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
  ) {}

  private parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    throw new BadRequestException({
      code: ErrorCode.ValidationFailed,
      message: "Request validation failed",
      details: result.error.flatten(),
    });
  }

  private userId(req: FastifyRequest): string {
    return (req as AuthenticatedRequest).user?.sub as string;
  }

  private async assertNotSuspended(userId: string): Promise<void> {
    const suspended = await this.identityCheck.isSuspended(userId) || await this.identityCheck.isDeletionScheduled(userId);
    if (suspended) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }
  }

  @Post()
  @SkipThrottle()
  async open(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    const parsed = this.parseOrThrow(VideoUploadsSchemas.OpenVideoUploadRequestSchema, body);
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);
    return this.sessions.open({
      userId,
      target: parsed.target,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
      coverOffsetMs: parsed.coverOffsetMs,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  }

  @Get(":sessionId")
  async status(@Param("sessionId") sessionId: string, @Req() req: FastifyRequest) {
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);
    return this.sessions.status({ userId, sessionId });
  }

  @Post(":sessionId/complete")
  @SkipThrottle()
  async complete(@Param("sessionId") sessionId: string, @Req() req: FastifyRequest) {
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);
    return this.sessions.complete({ userId, sessionId });
  }

  @Post(":sessionId/cancel")
  @SkipThrottle()
  async cancel(@Param("sessionId") sessionId: string, @Req() req: FastifyRequest) {
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);
    return this.sessions.cancel({ userId, sessionId });
  }
}
