import { lockEditableBusinessStock } from "./lockEditableBusinessStock";
import { ListingOwnership, assertListingOwnership, type ListingActor } from "../application/ListingOwnership";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import { ListingMedia } from "../domain/ListingMedia";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import type { ListingMediaClaim, ListingMediaRepository } from "../domain/ports/ListingMediaRepository";
import { UPLOAD_CLAIM_PORT, type UploadClaimPort } from "../domain/ports/UploadClaimPort";

@Injectable()
export class PrismaListingMediaRepository implements ListingMediaRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UPLOAD_CLAIM_PORT) private readonly claims: UploadClaimPort,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async save(media: ListingMedia, claim?: ListingMediaClaim): Promise<ListingMedia> {
    const data = {
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
      thumbHash: media.thumbHash ?? null,
    };
    const uploadId = media.uploadId;
    if (!uploadId) return this.toDomain(await this.prisma.listingMedia.create({ data }));
    if (!claim) throw new Error("An adopting media row needs its reservation");

    // The row and the adoption commit together (ADR-0088). Listing before
    // upload is the lock order removal uses too.
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id: media.listingId } });
      if (listing?.businessId) {
        if (!claim.actor) throw new Error("Business media needs current actor");
        await assertListingOwnership(this.ownership, claim.actor, { sellerId: listing.sellerId, businessId: listing.businessId }, tx);
        await lockEditableBusinessStock(tx, listing.id);
      }
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${media.listingId} FOR UPDATE`;
      const outcome = await this.claims.finalize(tx, {
        token: claim.token,
        uploadIds: [uploadId],
        target: { type: "listing", id: media.listingId },
        ...(claim.posterUploadId ? { referencedUploadIds: [claim.posterUploadId] } : {}),
      });
      if (outcome === "already") {
        // A joined retry: the other attempt committed this Listing's row first.
        const existing = await tx.listingMedia.findUnique({ where: { uploadId } });
        if (existing) return this.toDomain(existing);
        throw new DomainError(
          LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
          "Upload is already attached to a Listing",
        );
      }
      return this.toDomain(await tx.listingMedia.create({ data }));
    });
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

  async deleteReleasingUpload(id: string, minimumPhotos?: number, actor?: ListingActor): Promise<{ removed: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      let row = await tx.listingMedia.findUnique({ where: { id } });
      if (!row) return { removed: false };

      const listing = await tx.listing.findUnique({ where: { id: row.listingId } });
      if (listing?.businessId) {
        if (!actor) throw new Error("Business media needs current actor");
        await assertListingOwnership(this.ownership, actor, { sellerId: listing.sellerId, businessId: listing.businessId }, tx);
        await lockEditableBusinessStock(tx, listing.id);
      }
      if (minimumPhotos !== undefined) {
        // All removals of one Listing serialize, including distinct media IDs.
        await tx.$queryRaw`SELECT id FROM listings WHERE id = ${row.listingId} FOR UPDATE`;
        // The ID read above can precede a competing delete. Re-read after the
        // Listing lock so a lost same-ID removal is 404 before any floor check.
        row = await tx.listingMedia.findUnique({ where: { id } });
        if (!row) return { removed: false };
        const remaining = await tx.listingMedia.count({ where: {
          listingId: row.listingId, kind: "image", id: { not: id },
        } });
        if (remaining < minimumPhotos) throw new DomainError("PHOTO_MINIMUM_REQUIRED", `At least ${minimumPhotos} photos are required`);
      }

      // deleteMany reports whether this caller won; a concurrent remove sees 0.
      const { count } = await tx.listingMedia.deleteMany({ where: { id } });
      if (count === 0) return { removed: false };
      if (!row.uploadId) return { removed: true };

      // Releasing the adopter retires its upload in this transaction: the key
      // can never be adopted again, and deletion work is recorded for the
      // worker, which alone decides whether the bytes may go. A row whose key
      // is not its upload's key retires nothing.
      const upload = await tx.mediaUpload.findUnique({
        where: { id: row.uploadId },
        select: { key: true },
      });
      if (upload?.key === row.key) await this.claims.retire(tx, row.uploadId);
      return { removed: true };
    });
  }

  async updateSortOrder(listingId: string, orders: { mediaId: string; sortOrder: number }[], actor?: ListingActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id: listingId } });
      if (listing?.businessId) {
        if (!actor) throw new Error("Business media needs current actor");
        await assertListingOwnership(this.ownership, actor, { sellerId: listing.sellerId, businessId: listing.businessId }, tx);
        await lockEditableBusinessStock(tx, listing.id);
      }
      for (const order of orders) await tx.listingMedia.update({ where: { id: order.mediaId, listingId }, data: { sortOrder: order.sortOrder } });
    });
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
    thumbHash: string | null;
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
      ...(row.thumbHash !== null ? { thumbHash: row.thumbHash } : {}),
    });
  }
}
