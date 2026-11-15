import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { MediaUpload, NewMediaUpload, UploadState } from "../domain/MediaUpload";
import type { MediaUploadRepository } from "../domain/ports/MediaUploadRepository";

@Injectable()
export class PrismaMediaUploadRepository implements MediaUploadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(upload: NewMediaUpload): Promise<void> {
    await this.prisma.mediaUpload.create({
      data: {
        id: upload.id,
        userId: upload.userId,
        key: upload.key,
        kind: upload.kind,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        writeProtocol: upload.writeProtocol ?? "legacy",
        objectKeys: upload.objectKeys ?? [],
        createdAt: upload.createdAt,
      },
    });
  }

  async findByKeys(keys: string[]): Promise<MediaUpload[]> {
    if (keys.length === 0) return [];
    const rows = await this.prisma.mediaUpload.findMany({
      where: { key: { in: keys } },
      include: { media: { select: { id: true } }, profileOf: { select: { id: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      key: row.key,
      kind: row.kind,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      writeProtocol: row.writeProtocol as "legacy" | "conditional-v1",
      objectKeys: row.objectKeys,
      createdAt: row.createdAt,
      adopted: row.state === "ADOPTED" || row.media !== null || row.profileOf !== null,
      state: row.state as UploadState,
    }));
  }
}
