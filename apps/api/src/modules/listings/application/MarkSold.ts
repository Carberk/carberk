import { Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { LISTING_AUDIT_LOG, type ListingAuditLog } from "./ports/ListingAuditLog";

import type { Listing } from "../domain/Listing";
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  LISTING_EVENT_PUBLISHER,
  type ListingEventPublisher,
} from "../domain/ports/ListingEventPublisher";

export interface MarkSoldInput {
  listingId: string;
  userId: string;
}

export interface MarkSoldResult {
  listing: Listing;
}

@Injectable()
export class MarkSold {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_AUDIT_LOG)
    private readonly audit: ListingAuditLog,
    @Inject(LISTING_EVENT_PUBLISHER)
    private readonly events: ListingEventPublisher,
  ) {}

  async execute(input: MarkSoldInput): Promise<MarkSoldResult> {
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
        message: "Listing is banned and cannot be marked as sold",
      });
    }

    const updated = existing.markSold(new Date());
    const saved = await this.listings.update(updated);

    await this.audit.record({
      actorId: input.userId,
      action: "listing.marked_sold",
      targetType: "Listing",
      targetId: saved.id,
      details: {
        priceAmount: saved.priceAmount,
        priceCurrency: saved.priceCurrency,
        daysActive: saved.soldAt
          ? Math.floor(
              (saved.soldAt.getTime() - saved.publishedAt.getTime()) / 86_400_000,
            )
          : 0,
      },
    });

    await this.events.emit({
      event: "ListingSold",
      listingId: saved.id,
      sellerId: saved.sellerId,
    });

    return { listing: saved };
  }
}
