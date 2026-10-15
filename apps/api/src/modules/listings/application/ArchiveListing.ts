import { Optional , Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";
import { PrismaService } from "@auto-tm/db";

import type { Listing } from "../domain/Listing";
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";

export interface ArchiveListingInput {
  listingId: string;
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
}

export interface ArchiveListingResult {
  listing: Listing;
}

@Injectable()
export class ArchiveListing {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: ArchiveListingInput): Promise<ArchiveListingResult> {
    const existing = await this.listings.findById(input.listingId);
    if (!existing) {
      throw new NotFoundException("Listing not found");
    }
    await assertListingOwnership(this.ownership, input, existing);
    if (existing.status === "banned") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is banned and cannot be archived",
      });
    }

    const previousStatus = existing.status;
    const updated = existing.archive();
    const saved = await this.listings.update(updated, undefined, input);

    await this.prisma.auditLog.create({
      data: {
        actorId: input.userId,
        action: "listing.archived",
        targetType: "Listing",
        targetId: saved.id,
        details: { previousStatus },
      },
    });

    return { listing: saved };
  }
}
