import { Optional , Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";

import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  LISTING_MEDIA_REPOSITORY,
  type ListingMediaRepository,
} from "../domain/ports/ListingMediaRepository";

export interface ReorderMediaInput {
  listingId: string;
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
  ordering: { mediaId: string; sortOrder: number }[];
}

@Injectable()
export class ReorderMedia {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_MEDIA_REPOSITORY)
    private readonly mediaRepo: ListingMediaRepository,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: ReorderMediaInput): Promise<void> {
    const listing = await this.listings.findById(input.listingId);
    if (!listing || listing.deletedAt) {
      throw new NotFoundException("Listing not found");
    }
    if (!listing.businessId && listing.sellerId !== input.userId) throw new NotFoundException("Listing not found");
    await assertListingOwnership(this.ownership, input, listing);
    if (listing.status === "banned") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is banned and media cannot be reordered",
      });
    }

    await this.mediaRepo.updateSortOrder(input.listingId, input.ordering, input);
  }
}
