import { Controller, Post, Body, Param, Req, Res, Inject } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { VIDEO_GRANT_ISSUER, type VideoGrantIssuer } from "../application/VideoPlaybackPorts";
const inputSchema = z.object({ purpose: z.enum(["poster", "playback"]) }).strict();
@Controller("api/v1/listings")
export class VideoGrantController {
  constructor(@Inject(VIDEO_GRANT_ISSUER) private readonly issuer: VideoGrantIssuer) {}
  @Post(":listingId/video-grants")
  async issue(@Param("listingId") listingId: string, @Body() body: unknown, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer");
    const subject = (request as FastifyRequest & { user?: { sub?: unknown; sid?: unknown } }).user;
    if (typeof subject?.sub !== "string" || typeof subject.sid !== "string") { reply.code(401).send({ code: "UNAUTHORIZED" }); return; }
    const input = inputSchema.safeParse(body);
    if (!input.success || !z.string().uuid().safeParse(listingId).success) { reply.code(400).send({ code: "VIDEO_REQUEST_INVALID" }); return; }
    const grant = await this.issuer.issue({ listingId, userId: subject.sub, sessionId: subject.sid, purpose: input.data.purpose });
    if (!grant) { reply.code(404).send({ code: "VIDEO_UNAVAILABLE" }); return; }
    reply.code(201).send({ ...grant, expiresAt: grant.expiresAt.toISOString() });
  }
}
