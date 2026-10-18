import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { z } from "zod";
import { BUSINESS_AUTHORITY_PORT, IDENTITY_CLOCK_PORT, type BusinessAuthorityPort, type ClockPort } from "../../identity/identity.public";
import type { VideoPlaybackAuthority, VideoGrantIssuer } from "../application/VideoPlaybackPorts";
import { VideoManifestGateway } from "./VideoManifestGateway";

export const VIDEO_GRANT_SECRET_FACTORY = Symbol("VideoGrantSecretFactory");
export const VIDEO_PLAYBACK_ELIGIBILITY = Symbol("VideoPlaybackEligibility");
export interface VideoPlaybackEligibility { isEligible(userId: string): boolean; }
const manifestSchema = z.object({ assets: z.array(z.object({ path: z.string().max(256), purpose: z.enum(["poster", "playback"]), key: z.string().max(512), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), sizeBytes: z.number().int().positive().max(100 * 1024 * 1024), contentType: z.enum(["application/vnd.apple.mpegurl", "video/mp2t", "video/mp4", "image/webp", "image/jpeg"]) }).strict()).min(1).max(1024) }).strict();

/** Legacy unbound grants deny. This never selects a newest generation or public URL. */
@Injectable()
export class PrismaVideoPlayback implements VideoPlaybackAuthority, VideoGrantIssuer {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(BUSINESS_AUTHORITY_PORT) private readonly identity: BusinessAuthorityPort, @Inject(VIDEO_PLAYBACK_ELIGIBILITY) private readonly eligibility: VideoPlaybackEligibility, @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort, @Inject(VIDEO_GRANT_SECRET_FACTORY) private readonly newSecret: () => string) {}
  async authorize(secret: string): ReturnType<VideoPlaybackAuthority["authorize"]> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
    const secretHash = createHash("sha256").update(secret).digest("hex");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '500ms'`;
        const locks = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "video_grants" WHERE "secretHash" = ${secretHash} FOR SHARE`;
        if (!locks.length) return null;
        const grant = await tx.videoGrant.findUnique({ where: { secretHash } });
        if (!grant || !grant.ownerUserId || !grant.ownerSessionId || grant.revokedAt || grant.expiresAt <= this.clock.now() || !["poster", "playback"].includes(grant.purpose) || !this.eligibility.isEligible(grant.ownerUserId)) return null;
        const current = await this.current(tx, { userId: grant.ownerUserId, sessionId: grant.ownerSessionId }, grant.listingId, grant.generationId);
        if (!current) return null;
        return { purpose: grant.purpose as "poster" | "playback", assets: current.assets };
      }, { maxWait: 250, timeout: 1500 });
    } catch { return null; }
  }
  async issue(input: Parameters<VideoGrantIssuer["issue"]>[0]): ReturnType<VideoGrantIssuer["issue"]> {
    if (!input.userId || !input.sessionId || !["poster", "playback"].includes(input.purpose)) return null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '500ms'`;
        const current = await this.current(tx, input, input.listingId);
        if (!current) return null;
        const asset = current.assets.find((entry) => entry.purpose === input.purpose && (input.purpose === "poster" || entry.path === "master.m3u8"));
        if (!asset) return null;
        const secret = this.newSecret();
        if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
        const expiresAt = new Date(this.clock.now().getTime() + (input.purpose === "poster" ? 60_000 : 300_000));
        await tx.videoGrant.create({ data: { secretHash: createHash("sha256").update(secret).digest("hex"), ownerUserId: input.userId, ownerSessionId: input.sessionId, listingId: input.listingId, generationId: current.generationId, purpose: input.purpose, expiresAt } });
        return { url: `/video-grants/${secret}/${asset.path}`, generationId: current.generationId, expiresAt };
      }, { maxWait: 250, timeout: 1500 });
    } catch { return null; }
  }
  private async current(tx: Prisma.TransactionClient, subject: { userId: string; sessionId: string }, listingId: string, expectedGeneration?: string) {
    if (!this.eligibility.isEligible(subject.userId)) return null;
    await this.identity.resolve(subject, tx);
    await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId} FOR SHARE`;
    const listing = await tx.listing.findUnique({ where: { id: listingId }, include: { business: true } });
    if (!listing || listing.deletedAt || listing.status === "banned" || !listing.activeVideoGenerationId || (expectedGeneration && listing.activeVideoGenerationId !== expectedGeneration)) return null;
    if (listing.businessId && listing.business?.status !== "active") {
      try { await this.identity.authorize({ ...subject, businessId: listing.businessId, history: true }, tx); } catch { return null; }
    }
    await tx.$queryRaw`SELECT "id" FROM "video_generations" WHERE "id" = ${listing.activeVideoGenerationId} FOR SHARE`;
    const generation = await tx.videoGeneration.findUnique({ where: { id: listing.activeVideoGenerationId } });
    if (!generation || generation.listingId !== listing.id || generation.state !== "READY" || !generation.readyAt || generation.retiredAt) return null;
    const parsed = manifestSchema.safeParse(generation.manifest);
    if (!parsed.success) return null;
    const prefix = `video/v1/${generation.uploadId}/${generation.id}/`;
    if (parsed.data.assets.some((asset) => asset.key !== prefix + asset.path || asset.path === "source.mp4")) return null;
    new VideoManifestGateway(parsed.data.assets);
    return { generationId: generation.id, assets: parsed.data.assets };
  }

}
