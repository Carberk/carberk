import { Optional , Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";
import { PrismaService } from "@auto-tm/db";

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
  sessionId?: string | undefined;
  businessId?: string | undefined;
}

export interface MarkSoldResult {
  listing: Listing;
}

@Injectable()
export class MarkSold {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(LISTING_EVENT_PUBLISHER)
    private readonly events: ListingEventPublisher,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: MarkSoldInput): Promise<MarkSoldResult> {
    const existing = await this.listings.findById(input.listingId);
    if (!existing) {
      throw new NotFoundException("Listing not found");
    }
    await assertListingOwnership(this.ownership, input, existing);
    if (existing.status === "banned") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is banned and cannot be marked as sold",
      });
    }

    const updated = existing.markSold(new Date());
    const saved = await this.listings.update(updated, undefined, input);

    await this.prisma.auditLog.create({
      data: {
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
