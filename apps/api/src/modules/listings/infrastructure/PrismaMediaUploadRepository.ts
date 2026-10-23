import { ListingOwnership, assertListingOwnership, type ListingActor } from "../application/ListingOwnership";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { MediaUpload, NewMediaUpload, UploadState } from "../domain/MediaUpload";
import type { MediaUploadRepository } from "../domain/ports/MediaUploadRepository";

@Injectable()
export class PrismaMediaUploadRepository implements MediaUploadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership) {}

  async record(upload: NewMediaUpload, actor?: ListingActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (upload.businessId) {
        if (!actor) throw new Error("Business upload requires current actor");
        await assertListingOwnership(this.ownership, actor, upload, tx);
      }
      await tx.mediaUpload.create({
      data: {
        id: upload.id,
        userId: upload.userId,
        businessId: upload.businessId ?? null,
        key: upload.key,
        kind: upload.kind,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        writeProtocol: upload.writeProtocol ?? "legacy",
        objectKeys: upload.objectKeys ?? [],
        createdAt: upload.createdAt,
      },
    });
    });
  }

  async findByKeys(keys: string[]): Promise<MediaUpload[]> {
    if (keys.length === 0) return [];
    const rows = await this.prisma.mediaUpload.findMany({
      where: { key: { in: keys } },
      include: { media: { select: { id: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      ...(row.businessId ? { businessId: row.businessId } : {}),
      key: row.key,
      kind: row.kind,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      writeProtocol: row.writeProtocol as "legacy" | "conditional-v1",
      objectKeys: row.objectKeys,
      createdAt: row.createdAt,
      adopted: row.state === "ADOPTED" || row.media !== null,
      state: row.state as UploadState,
    }));
  }
}
