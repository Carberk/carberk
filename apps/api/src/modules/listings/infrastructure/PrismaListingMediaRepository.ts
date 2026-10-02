import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import { ListingMedia } from "../domain/ListingMedia";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import type { ListingMediaRepository } from "../domain/ports/ListingMediaRepository";

@Injectable()
export class PrismaListingMediaRepository implements ListingMediaRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(media: ListingMedia): Promise<ListingMedia> {
    try {
      const row = await this.prisma.listingMedia.create({
        data: {
          id: media.id,
          listingId: media.listingId,
          kind: media.kind,
          key: media.key,
          sortOrder: media.sortOrder,
          width: media.width ?? null,
          height: media.height ?? null,
          durationMs: media.durationMs ?? null,
          posterKey: media.posterKey ?? null,
          createdAt: media.createdAt,
          uploadId: media.uploadId ?? null,
        },
      });
      return this.toDomain(row);
    } catch (err) {
      // listing_media.uploadId is unique, so the database decides who adopts an
      // upload. Confirm the adopter really exists before reporting the conflict.
      if (
        media.uploadId &&
        isUniqueViolation(err) &&
        (await this.prisma.listingMedia.findUnique({ where: { uploadId: media.uploadId } }))
      ) {
        throw new DomainError(
          LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
          "Upload is already attached to a Listing",
        );
      }
      // A concurrent remove released the upload between the caller's check and
      // this insert; its row is gone, so the key can no longer be attached.
      if (media.uploadId && errorCode(err) === "P2003") {
        throw new DomainError(
          LISTING_ERROR_CODES.UPLOAD_NOT_AVAILABLE,
          "Upload is no longer available",
        );
      }
      throw err;
    }
  }

  async findById(id: string): Promise<ListingMedia | null> {
    const row = await this.prisma.listingMedia.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByListingId(listingId: string): Promise<ListingMedia[]> {
    const rows = await this.prisma.listingMedia.findMany({
      where: { listingId },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.listingMedia.delete({ where: { id } });
  }

  async deleteReleasingUpload(
    id: string,
  ): Promise<{ removed: boolean; ownedKey: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.listingMedia.findUnique({ where: { id } });
      if (!row) return { removed: false, ownedKey: null };

      // deleteMany reports whether this caller won; a concurrent remove sees 0.
      const { count } = await tx.listingMedia.deleteMany({ where: { id } });
      if (count === 0) return { removed: false, ownedKey: null };
      if (!row.uploadId) return { removed: true, ownedKey: null };

      // Releasing the upload makes its key unusable for any later attach. Another
      // row can still reference the key only for legacy duplicates made before
      // ADR-0077, and their objects must survive this removal.
      const stillReferenced = await tx.listingMedia.count({ where: { key: row.key } });
      const released = await tx.mediaUpload.deleteMany({
        where: { id: row.uploadId, key: row.key },
      });
      return {
        removed: true,
        ownedKey: released.count === 1 && stillReferenced === 0 ? row.key : null,
      };
    });
  }

  async updateSortOrder(
    listingId: string,
    orders: { mediaId: string; sortOrder: number }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      orders.map((o) =>
        this.prisma.listingMedia.update({
          where: { id: o.mediaId, listingId },
          data: { sortOrder: o.sortOrder },
        }),
      ),
    );
  }

  private toDomain(row: {
    id: string;
    listingId: string;
    kind: string;
    key: string;
    sortOrder: number;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    posterKey: string | null;
    createdAt: Date;
    uploadId: string | null;
  }): ListingMedia {
    return ListingMedia.create({
      id: row.id,
      listingId: row.listingId,
      kind: row.kind as "image" | "video",
      key: row.key,
      sortOrder: row.sortOrder,
      ...(row.width !== null ? { width: row.width } : {}),
      ...(row.height !== null ? { height: row.height } : {}),
      ...(row.durationMs !== null ? { durationMs: row.durationMs } : {}),
      ...(row.posterKey !== null ? { posterKey: row.posterKey } : {}),
      createdAt: row.createdAt,
      ...(row.uploadId !== null ? { uploadId: row.uploadId } : {}),
    });
  }
}

function errorCode(err: unknown): unknown {
  return typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
}

/** Prisma reports a unique-constraint violation as a known request error, code P2002. */
function isUniqueViolation(err: unknown): boolean {
  return errorCode(err) === "P2002";
}
