import { LISTING_MEDIA_COUNTS, type ListingMediaCounts } from "./ports/ListingMediaCounts";
import { Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { LISTING_AUDIT_LOG, type ListingAuditLog } from "./ports/ListingAuditLog";

import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  LISTING_EVENT_PUBLISHER,
  type ListingEventPublisher,
} from "../domain/ports/ListingEventPublisher";

export interface DeleteListingInput {
  listingId: string;
  userId: string;
}

@Injectable()
export class DeleteListing {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_AUDIT_LOG)
    private readonly audit: ListingAuditLog,
    @Inject(LISTING_EVENT_PUBLISHER)
    private readonly events: ListingEventPublisher,
    @Inject(LISTING_MEDIA_COUNTS)
    private readonly mediaCounts: ListingMediaCounts,
  ) {}

  async execute(input: DeleteListingInput): Promise<void> {
    const existing = await this.listings.findById(input.listingId);
    if (!existing) {
      throw new NotFoundException("Listing not found");
    }
    if (existing.sellerId !== input.userId) {
      throw new ForbiddenException("Not the owner of this listing");
    }
    if (existing.status === "banned") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is banned and cannot be deleted",
      });
    }

    const mediaCount = await this.mediaCounts.count(existing.id);

    await this.listings.softDelete(existing.id, new Date());

    await this.audit.record({
      actorId: input.userId,
      action: "listing.deleted",
      targetType: "Listing",
      targetId: existing.id,
      details: {
        status: existing.status,
        mediaCount,
      },
    });

    await this.events.emit({
      event: "ListingDeleted",
      listingId: existing.id,
      sellerId: existing.sellerId,
    });
  }
}
