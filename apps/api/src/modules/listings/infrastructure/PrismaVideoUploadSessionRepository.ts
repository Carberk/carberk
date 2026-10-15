import { Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { VideoSessionRecord, VideoSessionState } from "../application/VideoUploadSession";

@Injectable()
export class PrismaVideoUploadSessionRepository {
  constructor(private readonly prisma: PrismaService) {}
  async find(id: string): Promise<VideoSessionRecord | null> {
    const row = await this.prisma.videoUploadSession.findUnique({ where: { id } });
    return row ? { id: row.id, uploadId: row.uploadId, userId: row.userId, ...(row.listingId ? { listingId: row.listingId } : {}), state: row.state as VideoSessionState, expiresAt: row.expiresAt, claimToken: row.uploadId } : null;
  }
  async create(input: { id: string; uploadId: string; userId: string; listingId?: string; sourceKey: string; expiresAt: Date }): Promise<VideoSessionRecord> {
    const row = await this.prisma.videoUploadSession.create({ data: { id: input.id, uploadId: input.uploadId, userId: input.userId, listingId: input.listingId, sourceKey: input.sourceKey, expiresAt: input.expiresAt } });
    return { id: row.id, uploadId: row.uploadId, userId: row.userId, ...(row.listingId ? { listingId: row.listingId } : {}), state: row.state as VideoSessionState, expiresAt: row.expiresAt, claimToken: row.uploadId };
  }
  async transition(id: string, state: VideoSessionState): Promise<void> { await this.prisma.videoUploadSession.update({ where: { id }, data: { state } }); }
}
