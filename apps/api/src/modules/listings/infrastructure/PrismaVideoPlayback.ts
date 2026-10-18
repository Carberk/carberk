import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { z } from "zod";
import { BUSINESS_AUTHORITY_PORT, type BusinessAuthorityPort } from "../../identity/identity.public";
import type { VideoPlaybackAuthority } from "../application/VideoPlaybackPorts";
import { VideoManifestGateway } from "./VideoManifestGateway";

export const VIDEO_PLAYBACK_ELIGIBILITY = Symbol("VideoPlaybackEligibility");
export interface VideoPlaybackEligibility { isEligible(userId: string): boolean; }
const manifestSchema = z.object({ assets: z.array(z.object({ path: z.string().max(256), purpose: z.enum(["poster", "playback"]), key: z.string().max(512), sizeBytes: z.number().int().positive().max(100 * 1024 * 1024), contentType: z.enum(["application/vnd.apple.mpegurl", "video/mp2t", "video/mp4", "image/webp", "image/jpeg"]) }).strict()).min(1).max(1024) }).strict();

/** Legacy unbound grants deny. This never selects a newest generation or public URL. */
@Injectable()
export class PrismaVideoPlayback implements VideoPlaybackAuthority {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(BUSINESS_AUTHORITY_PORT) private readonly identity: BusinessAuthorityPort, @Inject(VIDEO_PLAYBACK_ELIGIBILITY) private readonly eligibility: VideoPlaybackEligibility) {}
  async authorize(secret: string): ReturnType<VideoPlaybackAuthority["authorize"]> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
    const secretHash = createHash("sha256").update(secret).digest("hex");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '500ms'`;
        const locks = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "video_grants" WHERE "secretHash" = ${secretHash} FOR SHARE`;
        if (!locks.length) return null;
        const grant = await tx.videoGrant.findUnique({ where: { secretHash } });
        if (!grant || !grant.ownerUserId || !grant.ownerSessionId || grant.revokedAt || grant.expiresAt <= new Date() || !["poster", "playback"].includes(grant.purpose) || !this.eligibility.isEligible(grant.ownerUserId)) return null;
        const subject = { userId: grant.ownerUserId, sessionId: grant.ownerSessionId };
        await this.identity.resolve(subject, tx);
        await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${grant.listingId} FOR SHARE`;
        const listing = await tx.listing.findUnique({ where: { id: grant.listingId }, include: { business: true } });
        if (!listing || listing.deletedAt || listing.activeVideoGenerationId !== grant.generationId) return null;
        let member = false;
        if (listing.businessId && ((listing.business?.status !== "active") || listing.status === "banned")) {
          try { await this.identity.authorize({ ...subject, businessId: listing.businessId, history: true }, tx); member = true; } catch { return null; }
        }
        if (listing.status === "banned" && !(listing.businessId ? member : listing.sellerId === subject.userId)) return null;
        await tx.$queryRaw`SELECT "id" FROM "video_generations" WHERE "id" = ${grant.generationId} FOR SHARE`;
        const generation = await tx.videoGeneration.findUnique({ where: { id: grant.generationId } });
        if (!generation || generation.listingId !== listing.id || generation.state !== "READY" || !generation.readyAt || generation.retiredAt) return null;
        const parsed = manifestSchema.safeParse(generation.manifest);
        if (!parsed.success) return null;
        const prefix = `video/v1/${generation.uploadId}/${generation.id}/`;
        if (parsed.data.assets.some((asset) => asset.key !== prefix + asset.path || asset.path === "source.mp4")) return null;
        new VideoManifestGateway(parsed.data.assets);
        return { purpose: grant.purpose as "poster" | "playback", assets: parsed.data.assets };
      }, { maxWait: 250, timeout: 1500 });
    } catch { return null; }
  }
}
