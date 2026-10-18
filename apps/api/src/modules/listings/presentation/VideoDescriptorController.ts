import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

import { VIDEO_DESCRIPTOR_READER, type VideoDescriptorReader } from "../application/VideoPlaybackPorts";

@Controller("api/v1/listings")
export class VideoDescriptorController {
  constructor(@Inject(VIDEO_DESCRIPTOR_READER) private readonly reader: VideoDescriptorReader) {}
  @Get(":listingId/video")
  async read(@Param("listingId") listingId: string, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer");
    const subject = (request as FastifyRequest & { user?: { sub?: unknown; sid?: unknown } }).user;
    if (typeof subject?.sub !== "string" || typeof subject.sid !== "string") { reply.code(401).send({ code: "UNAUTHORIZED" }); return; }
    if (!z.string().uuid().safeParse(listingId).success) { reply.code(400).send({ code: "VIDEO_REQUEST_INVALID" }); return; }
    const current = await this.reader.describe({ listingId, userId: subject.sub, sessionId: subject.sid });
    if (!current) { reply.code(404).send({ code: "VIDEO_UNAVAILABLE" }); return; }
    reply.code(200).send(current);
  }
}
