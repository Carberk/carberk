import { Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { LISTING_AUDIT_LOG, type ListingAuditLog } from "./ports/ListingAuditLog";

import type { Listing } from "../domain/Listing";
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";

export interface ArchiveListingInput {
  listingId: string;
  userId: string;
}

export interface ArchiveListingResult {
  listing: Listing;
}

@Injectable()
export class ArchiveListing {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_AUDIT_LOG)
    private readonly audit: ListingAuditLog,
  ) {}

  async execute(input: ArchiveListingInput): Promise<ArchiveListingResult> {
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
        message: "Listing is banned and cannot be archived",
      });
    }

    const previousStatus = existing.status;
    const updated = existing.archive();
    const saved = await this.listings.update(updated);

    await this.audit.record({
      actorId: input.userId,
      action: "listing.archived",
      targetType: "Listing",
      targetId: saved.id,
      details: { previousStatus },
    });

    return { listing: saved };
  }
}
