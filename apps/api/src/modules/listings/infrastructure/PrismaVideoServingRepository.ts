import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { ServingVideo, VideoServingRepository } from "../domain/ports/VideoServingRepository";

@Injectable()
export class PrismaVideoServingRepository implements VideoServingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async find(target: Parameters<VideoServingRepository["find"]>[0]): Promise<ServingVideo | null> {
    const videoId = "videoId" in target ? target.videoId : null;
    const listingId = "type" in target && target.type === "listing" ? target.id : null;
    const draftId = "type" in target && target.type === "draft" ? target.id : null;
    const rows = await this.prisma.$queryRaw<ServingVideo[]>`
      SELECT v.id, v."ownerId", COALESCE(l."sellerId", d."userId") AS "targetOwnerId",
        l.status AS "listingStatus", (l."deletedAt" IS NOT NULL OR (l.id IS NULL AND d.id IS NULL)) AS deleted,
        p.status AS "pendingStatus",
        CASE WHEN g.id IS NOT NULL THEN jsonb_build_object(
          'id', g.id, 'status', g.status, 'durationMs', g."durationMs", 'manifest', g.manifest,
          'sourceState', s.state, 'bucket', s.bucket
        ) END AS active
      FROM listing_videos v
      LEFT JOIN listings l ON l.id = v."listingId"
      LEFT JOIN listing_drafts d ON d.id = v."draftId"
      LEFT JOIN video_generations g ON g.id = v."activeGenerationId" AND g."listingVideoId" = v.id
      LEFT JOIN video_sources s ON s.id = g."sourceId" AND s."listingVideoId" = v.id
      LEFT JOIN video_generations p ON p.id = v."pendingGenerationId" AND p."listingVideoId" = v.id AND p.status <> 'Retired'
      WHERE v.id = ${videoId} OR v."listingId" = ${listingId} OR v."draftId" = ${draftId}`;
    return rows[0] ?? null;
  }
}
