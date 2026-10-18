import { Injectable } from "@nestjs/common";
import type { PrismaService } from "@auto-tm/db";
import type { VideoSessionRecord, VideoSessionState } from "../application/VideoUploadSession";

@Injectable()
export class PrismaVideoUploadSessionRepository {
  constructor(private readonly prisma: PrismaService) {}
  async find(id: string): Promise<VideoSessionRecord | null> {
    const row = await this.prisma.videoUploadSession.findUnique({ where: { id } });
    return row ? { id: row.id, uploadId: row.uploadId, userId: row.userId, ...(row.listingId ? { listingId: row.listingId } : {}), sourceKey: row.sourceKey, state: row.state as VideoSessionState, expiresAt: row.expiresAt, claimToken: row.id } : null;
  }
  async create(input: { id: string; uploadId: string; userId: string; listingId?: string; expiresAt: Date }): Promise<VideoSessionRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const upload = await tx.mediaUpload.findUnique({ where: { id: input.uploadId } });
      if (!upload || upload.userId !== input.userId || upload.kind !== "video" || upload.state !== "AVAILABLE") {
        throw new Error("VIDEO_UPLOAD_NOT_AUTHORIZED");
      }
      const claimed = await tx.mediaUpload.updateMany({
        where: { id: input.uploadId, userId: input.userId, kind: "video", state: "AVAILABLE" },
        data: { state: "PREPARING", claimToken: input.id, claimTargetType: "video_session", claimTargetId: input.id, claimDeadline: input.expiresAt },
      });
      if (claimed.count !== 1) throw new Error("VIDEO_UPLOAD_STALE");
      return tx.videoUploadSession.create({ data: { id: input.id, uploadId: input.uploadId, userId: input.userId, listingId: input.listingId ?? null, sourceKey: upload.key, expiresAt: input.expiresAt } });
    });
    return { id: row.id, uploadId: row.uploadId, userId: row.userId, ...(row.listingId ? { listingId: row.listingId } : {}), sourceKey: row.sourceKey, state: row.state as VideoSessionState, expiresAt: row.expiresAt, claimToken: row.id };
  }
  async transition(id: string, userId: string, expectedState: VideoSessionState, state: VideoSessionState): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.videoUploadSession.updateMany({ where: { id, userId, state: expectedState }, data: { state } });
      if (changed.count !== 1) throw new Error("VIDEO_SESSION_STALE");
      if (state === "CLEANUP_PENDING") {
        await tx.mediaUpload.updateMany({ where: { id: (await tx.videoUploadSession.findUniqueOrThrow({ where: { id } })).uploadId, userId, state: "PREPARING", claimToken: id }, data: { state: "AVAILABLE", claimToken: null, claimTargetType: null, claimTargetId: null, claimDeadline: null } });
      }
    });
  }
}
