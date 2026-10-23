import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, HttpException, Inject, Param, Post, Req, UnauthorizedException, UseFilters } from "@nestjs/common";

import { VideoUploadSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { OWNED_VIDEO_UPLOAD_PROTOCOL, type OwnedVideoUploadProtocol } from "../application/OwnedVideoUploadProtocol";
import { VideoEligibility } from "../application/VideoEligibility";
import { VideoUploadErrorFilter } from "./VideoUploadErrorFilter";
import { inventoryActor } from "./inventoryActor";

@UseFilters(VideoUploadErrorFilter)
@Controller("api/v1/listing-video-upload-sessions")
export class VideoUploadController {
  constructor(
    @Inject(OWNED_VIDEO_UPLOAD_PROTOCOL) private readonly protocol: OwnedVideoUploadProtocol,
    @Inject(VideoEligibility) private readonly eligibility: VideoEligibility,
  ) {}
  @Post()
  @Header("Cache-Control", "private, no-store")
  async create(@Req() req: FastifyRequest, @Body() body: unknown) {
    const actor = this.actor(req, true);
    const parsed = VideoUploadSchemas.CreateSessionInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: "VIDEO_UPLOAD_INVALID" });
    return this.perform(() => this.protocol.create(actor, parsed.data));
  }
  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  async status(@Req() req: FastifyRequest, @Param("id") id: string) {
    const actor = this.actor(req); this.id(id);
    return this.perform(() => this.protocol.get(actor, id));
  }
  @Post(":id/part-credentials")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async credentials(@Req() req: FastifyRequest, @Param("id") id: string, @Body() body: unknown) {
    const actor = this.actor(req, true); this.id(id);
    const parsed = VideoUploadSchemas.PartCredentialsInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: "VIDEO_PART_INVALID" });
    return this.perform(() => this.protocol.credentials(actor, id, parsed.data.partNumbers));
  }
  @Post(":id/pause")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async pause(@Req() req: FastifyRequest, @Param("id") id: string, @Body() body: unknown) {
    const actor = this.actor(req); this.id(id); this.empty(body);
    return this.perform(() => this.protocol.change(actor, id, "pause"));
  }
  @Post(":id/resume")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async resume(@Req() req: FastifyRequest, @Param("id") id: string, @Body() body: unknown) {
    const actor = this.actor(req, true); this.id(id); this.empty(body);
    return this.perform(() => this.protocol.change(actor, id, "resume"));
  }
  @Post(":id/complete")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async complete(@Req() req: FastifyRequest, @Param("id") id: string, @Body() body: unknown) {
    const actor = this.actor(req, true); this.id(id); this.empty(body);
    return this.perform(() => this.protocol.complete(actor, id));
  }
  @Delete(":id")
  @HttpCode(202)
  @Header("Cache-Control", "private, no-store")
  async cancel(@Req() req: FastifyRequest, @Param("id") id: string) {
    const actor = this.actor(req); this.id(id);
    return this.perform(() => this.protocol.change(actor, id, "cancel"));
  }
  private actor(req: FastifyRequest, uploading = false) {
    const actor = inventoryActor(req);
    if (!actor.userId || !actor.sessionId) throw new UnauthorizedException();
    if (uploading) this.eligibility.assertUploadEligible(actor.userId);
    else this.eligibility.assertEligible(actor.userId);
    return actor;
  }
  private id(id: string) { if (!z.string().uuid().safeParse(id).success) throw new BadRequestException({ code: "VIDEO_SESSION_INVALID" }); }
  private empty(body: unknown) { if (!VideoUploadSchemas.EmptyInput.safeParse(body ?? {}).success) throw new BadRequestException({ code: "VIDEO_UPLOAD_INVALID" }); }
  private async perform<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      const code = error instanceof Error ? error.message : "";
      if (code === "VIDEO_IDEMPOTENCY_CONFLICT") throw new HttpException({ code }, 409);
      if (code === "VIDEO_PART_INVALID") throw new BadRequestException({ code });
      if (["VIDEO_SESSION_INITIALIZING", "VIDEO_COMPLETION_UNCERTAIN", "VIDEO_STORAGE_UNAVAILABLE"].includes(code)) throw new HttpException({ code }, 503);
      if (["VIDEO_SESSION_UNAVAILABLE", "VIDEO_PARTS_INVALID"].includes(code)) throw new HttpException({ code: "VIDEO_SESSION_UNAVAILABLE" }, 404);
      throw new HttpException({ code: "VIDEO_SERVICE_UNAVAILABLE" }, 503);
    }
  }
}

@UseFilters(VideoUploadErrorFilter)
@Controller("api/v1/listings")
export class ListingVideoRemovalController {
  constructor(
    @Inject(OWNED_VIDEO_UPLOAD_PROTOCOL) private readonly protocol: OwnedVideoUploadProtocol,
    @Inject(VideoEligibility) private readonly eligibility: VideoEligibility,
  ) {}
  @Delete(":id/video")
  @HttpCode(204)
  @Header("Cache-Control", "private, no-store")
  async remove(@Req() req: FastifyRequest, @Param("id") id: string) {
    const actor = inventoryActor(req);
    if (!actor.userId || !actor.sessionId) throw new UnauthorizedException();
    this.eligibility.assertEligible(actor.userId);
    if (!z.string().uuid().safeParse(id).success) throw new BadRequestException({ code: "VIDEO_SESSION_INVALID" });
    try { await this.protocol.removeListing(actor, id); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && error.message === "VIDEO_SESSION_UNAVAILABLE") throw new HttpException({ code: "VIDEO_SESSION_UNAVAILABLE" }, 404);
      throw new HttpException({ code: "VIDEO_SERVICE_UNAVAILABLE" }, 503);
    }
  }
}

@UseFilters(VideoUploadErrorFilter)
@Controller("api/v1/listing-video-targets")
export class VideoTargetController {
  private async perform<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && error.message === "VIDEO_SESSION_UNAVAILABLE") throw new HttpException({ code: "VIDEO_SESSION_UNAVAILABLE" }, 404);
      throw new HttpException({ code: "VIDEO_SERVICE_UNAVAILABLE" }, 503);
    }
  }
  constructor(@Inject(OWNED_VIDEO_UPLOAD_PROTOCOL) private readonly protocol: OwnedVideoUploadProtocol, @Inject(VideoEligibility) private readonly eligibility: VideoEligibility) {}
  private actor(req: FastifyRequest, kind: string, id: string) {
    const actor = inventoryActor(req);
    if (!actor.sessionId) throw new UnauthorizedException();
    this.eligibility.assertEligible(actor.userId);
    if (!["listing", "draft"].includes(kind) || !z.string().uuid().safeParse(id).success) throw new BadRequestException({ code: "VIDEO_SESSION_INVALID" });
    return actor;
  }
  @Get(":kind/:id")
  @Header("Cache-Control", "private, no-store")
  async state(@Req() req: FastifyRequest, @Param("kind") kind: "draft" | "listing", @Param("id") id: string) {
    const actor = this.actor(req, kind, id);
    return this.perform(() => this.protocol.targetState(actor, kind, id));
  }
  @Delete("listing/:id/pending")
  @HttpCode(204)
  @Header("Cache-Control", "private, no-store")
  async cancelPending(@Req() req: FastifyRequest, @Param("id") id: string) {
    const actor = this.actor(req, "listing", id);
    return this.perform(() => this.protocol.cancelPending(actor, id));
  }
}
