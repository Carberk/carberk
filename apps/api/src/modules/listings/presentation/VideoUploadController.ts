import { Body, Controller, Inject, Param, Patch, Post, Req, UnauthorizedException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { VideoUploadSessionService } from "../application/VideoUploadSession";
import { VideoEligibility } from "../application/VideoEligibility";
import { PrismaVideoUploadSessionRepository } from "../infrastructure/PrismaVideoUploadSessionRepository";
@Controller("api/v1/listings/video")
export class VideoUploadController {
  constructor(@Inject(PrismaVideoUploadSessionRepository) private readonly repo: PrismaVideoUploadSessionRepository, @Inject(VideoUploadSessionService) private readonly sessions: VideoUploadSessionService, @Inject(VideoEligibility) private readonly eligibility: VideoEligibility) {}
  private user(req: FastifyRequest): string { const id = (req as FastifyRequest & { user?: { sub?: unknown } }).user?.sub; if (typeof id !== "string") throw new UnauthorizedException(); return id; }
  @Post("sessions") async create(@Req() req: FastifyRequest, @Body() body: { uploadId: string; listingId?: string }) { const userId = this.user(req); this.eligibility.assertEligible(userId); if (!body || typeof body.uploadId !== "string") throw new BadRequestException("VIDEO_UPLOAD_REQUIRED"); return this.repo.create({ id: randomUUID(), uploadId: body.uploadId, userId, ...(typeof body.listingId === "string" ? { listingId: body.listingId } : {}), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }); }
  @Patch("sessions/:id/:action") async transition(@Req() req: FastifyRequest, @Param("id") id: string, @Param("action") action: string) { const userId = this.user(req); this.eligibility.assertEligible(userId); const session = await this.repo.find(id); if (!session) throw new BadRequestException("VIDEO_SESSION_NOT_FOUND"); if (session.userId !== userId) throw new ForbiddenException(); const next = action === "pause" ? this.sessions.pause(session, userId) : action === "resume" ? this.sessions.resume(session, userId) : action === "cancel" ? this.sessions.cancel(session, userId) : null; if (!next) throw new BadRequestException("VIDEO_ACTION_INVALID"); await this.repo.transition(id, userId, session.state, next.state); return { id, state: next.state }; }
}
