import { Body, Controller, Inject, Param, Patch, Post, Req, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { VideoEligibility } from "../application/VideoEligibility";
import { PrismaVideoUploadSessionRepository } from "../infrastructure/PrismaVideoUploadSessionRepository";
import { inventoryActor } from "./inventoryActor";

const createBody = z.object({ uploadId: z.string().uuid(), listingId: z.string().uuid().optional() }).strict();
const actions = z.enum(["pause", "resume", "cancel"]);

@Controller("api/v1/listings/video")
export class VideoUploadController {
  constructor(
    @Inject(PrismaVideoUploadSessionRepository) private readonly repo: PrismaVideoUploadSessionRepository,
    @Inject(VideoEligibility) private readonly eligibility: VideoEligibility,
  ) {}

  private actor(req: FastifyRequest) {
    const actor = inventoryActor(req);
    if (!actor.userId || !actor.sessionId) throw new UnauthorizedException();
    this.eligibility.assertEligible(actor.userId);
    return actor;
  }

  @Post("sessions")
  async create(@Req() req: FastifyRequest, @Body() body: unknown) {
    const actor = this.actor(req);
    this.eligibility.assertUploadEligible(actor.userId);
    const parsed = createBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: "VIDEO_UPLOAD_INVALID" });
    return this.repo.create({ id: randomUUID(), actor, uploadId: parsed.data.uploadId, ...(parsed.data.listingId ? { listingId: parsed.data.listingId } : {}) });
  }

  @Patch("sessions/:id/:action")
  async transition(@Req() req: FastifyRequest, @Param("id") id: string, @Param("action") action: string) {
    const actor = this.actor(req);
    const parsed = actions.safeParse(action);
    if (!z.string().uuid().safeParse(id).success || !parsed.success) throw new BadRequestException({ code: "VIDEO_ACTION_INVALID" });
    const session = await this.repo.find(id);
    if (!session || session.userId !== actor.userId) throw new BadRequestException({ code: "VIDEO_SESSION_NOT_FOUND" });
    const next = await this.repo.transition(id, actor, session.state, parsed.data);
    return { id, state: next.state };
  }
}
