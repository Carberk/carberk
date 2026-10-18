import { Controller, Get, Header, Inject, Req, UseFilters } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { BUSINESS_AUTHORITY_PORT, type BusinessAuthorityPort } from "../../identity/identity.public";
import { VideoEligibility } from "../application/VideoEligibility";
import { VideoUploadErrorFilter } from "./VideoUploadErrorFilter";
import { inventoryActor } from "./inventoryActor";

@UseFilters(VideoUploadErrorFilter)
@Controller("api/v1/listing-video")
export class VideoCapabilitiesController {
  constructor(@Inject(BUSINESS_AUTHORITY_PORT) private readonly identity: BusinessAuthorityPort, @Inject(VideoEligibility) private readonly eligibility: VideoEligibility) {}
  @Get("capabilities")
  @Header("Cache-Control", "private, no-store")
  async capabilities(@Req() request: FastifyRequest) {
    const actor = inventoryActor(request);
    if (!actor.sessionId || !this.eligibility.isEligible(actor.userId)) return { canUpload: false, canView: false };
    try { await this.identity.resolve({ userId: actor.userId, sessionId: actor.sessionId }); }
    catch { return { canUpload: false, canView: false }; }
    return { canUpload: this.eligibility.isUploadEligible(actor.userId), canView: true };
  }
}
