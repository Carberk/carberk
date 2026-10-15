import { Body, Controller, Inject, Param, Patch, Post, Req, UnauthorizedException, ForbiddenException, BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { VideoUploadSessionService } from "../application/VideoUploadSession";
import { PrismaVideoUploadSessionRepository } from "../infrastructure/PrismaVideoUploadSessionRepository";
@Controller("api/v1/listings/video")
export class VideoUploadController {
  constructor(@Inject(PrismaVideoUploadSessionRepository) private readonly repo: PrismaVideoUploadSessionRepository, private readonly sessions: VideoUploadSessionService) {}
  private user(req: FastifyRequest): string { const id = (req as FastifyRequest & { user?: { sub?: unknown } }).user?.sub; if (typeof id !== "string") throw new UnauthorizedException(); return id; }
  @Post("sessions") async create(@Req() req: FastifyRequest, @Body() body: { id: string; uploadId: string; sourceKey: string; listingId?: string }) { return this.repo.create({ ...body, userId: this.user(req), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }); }
  @Patch("sessions/:id/:action") async transition(@Req() req: FastifyRequest, @Param("id") id: string, @Param("action") action: string) { const userId = this.user(req); const session = await this.repo.find(id); if (!session) throw new BadRequestException("VIDEO_SESSION_NOT_FOUND"); if (action === "cancel" && session.userId !== userId) throw new ForbiddenException(); const next = action === "pause" ? this.sessions.pause(session, userId) : action === "resume" ? this.sessions.resume(session, userId) : action === "cancel" ? this.sessions.cancel(session, userId) : null; if (!next) throw new BadRequestException("VIDEO_ACTION_INVALID"); await this.repo.transition(id, next.state); return { id, state: next.state }; }
}
