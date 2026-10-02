import { Inject, Injectable, NotFoundException, Logger, ForbiddenException } from "@nestjs/common";

import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  LISTING_MEDIA_REPOSITORY,
  type ListingMediaRepository,
} from "../domain/ports/ListingMediaRepository";
import {
  MEDIA_STORAGE_PORT,
  type MediaStoragePort,
} from "../domain/ports/MediaStoragePort";

export interface RemoveMediaInput {
  listingId: string;
  mediaId: string;
  userId: string;
}

@Injectable()
export class RemoveMedia {
  private readonly logger = new Logger(RemoveMedia.name);

  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_MEDIA_REPOSITORY)
    private readonly mediaRepo: ListingMediaRepository,
    @Inject(MEDIA_STORAGE_PORT)
    private readonly storage: MediaStoragePort,
  ) {}

  async execute(input: RemoveMediaInput): Promise<void> {
    const listing = await this.listings.findById(input.listingId);
    if (!listing || listing.sellerId !== input.userId || listing.deletedAt) {
      throw new NotFoundException("Listing not found");
    }
    if (listing.status === "banned") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is banned and media cannot be removed",
      });
    }

    const media = await this.mediaRepo.findById(input.mediaId);
    if (!media || media.listingId !== input.listingId) {
      throw new NotFoundException("Media not found");
    }

    // Deleting the row also releases the upload it adopted, atomically. Only the
    // caller that releases an adopted upload gets a key back; a row with no
    // provenance, or whose key another row still references, never does, so a
    // key copied from another Listing can never reach the storage deletes below
    // (ADR-0079).
    const { removed, ownedKey } = await this.mediaRepo.deleteReleasingUpload(input.mediaId);
    if (!removed) {
      throw new NotFoundException("Media not found");
    }
    if (ownedKey === null) {
      this.logger.warn(
        `Media ${input.mediaId} removed without storage cleanup: no exclusive upload provenance`,
      );
      return;
    }

    // Best-effort MinIO cleanup — errors are logged but don't fail the use-case
    const base = ownedKey.replace(/\/original\.(jpg|webp|jpeg|mp4)$/, "");
    const suffixes = [
      "original.jpg",
      "original.webp",
      "thumbnail.jpg",
      "thumbnail.webp",
      "list.jpg",
      "list.webp",
      "detail.jpg",
      "detail.webp",
      "fullscreen.jpg",
      "fullscreen.webp",
    ];

    await Promise.all(
      suffixes.map(async (suffix) => {
        try {
          await this.storage.deleteObject(`${base}/${suffix}`);
        } catch (err) {
          this.logger.warn(
            `Failed to delete MinIO object ${base}/${suffix}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
  }
}
