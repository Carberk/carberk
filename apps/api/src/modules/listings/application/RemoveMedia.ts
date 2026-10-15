import { Optional , Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";
import { ListingsSchemas } from "@auto-tm/contracts";

import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  LISTING_MEDIA_REPOSITORY,
  type ListingMediaRepository,
} from "../domain/ports/ListingMediaRepository";
import { DomainError } from "../domain/types";

export interface RemoveMediaInput {
  listingId: string;
  mediaId: string;
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
}

@Injectable()
export class RemoveMedia {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_MEDIA_REPOSITORY)
    private readonly mediaRepo: ListingMediaRepository,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: RemoveMediaInput): Promise<void> {
    const listing = await this.listings.findById(input.listingId);
    if (!listing || listing.deletedAt) {
      throw new NotFoundException("Listing not found");
    }
    if (!listing.businessId && listing.sellerId !== input.userId) throw new NotFoundException("Listing not found");
    await assertListingOwnership(this.ownership, input, listing);
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

    // Deleting the row retires the upload it adopted in the same transaction and
    // records its deletion work (ADR-0088). The request deletes no stored object:
    // the cleanup worker does, once nothing live references the directory.
    const { removed } = await this.mediaRepo.deleteReleasingUpload(
      input.mediaId, ListingsSchemas.MIN_LISTING_PHOTOS, input,
    ).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "PHOTO_MINIMUM_REQUIRED") {
        throw new BadRequestException({ code: error.code, message: error.message, details: { minimum: ListingsSchemas.MIN_LISTING_PHOTOS } });
      }
      throw error;
    });
    if (!removed) {
      throw new NotFoundException("Media not found");
    }
  }
}
