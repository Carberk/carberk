import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { MODERATION_UNIT_OF_WORK, type ModerationUnitOfWork } from "./ports/ModerationUnitOfWork";
import { AdminSchemas } from "@auto-tm/contracts";

import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";

export interface UnbanListingInput {
  listingId: string;
  adminUserId: string;
  reason: string;
}

export interface UnbanListingResult {
  targetId: string;
  targetState: { status: string };
  auditLogId: string;
}

@Injectable()
export class UnbanListing {
  constructor(
    @Inject(MODERATION_UNIT_OF_WORK)
    private readonly moderation: ModerationUnitOfWork,
    @Inject(LISTINGS_READ_PORT)
    private readonly listingsRead: ListingsReadPort,
  ) {}

  async execute(input: UnbanListingInput): Promise<UnbanListingResult> {
    // 1. Validate listing exists and is banned
    const listings = await this.listingsRead.getListingAdminSummaries([
      input.listingId,
    ]);
    const listing = listings[0];

    if (!listing) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Listing not found",
      });
    }

    if (listing.status !== "banned") {
      throw new ConflictException({
        code: "CONFLICT",
        message: "Listing is not in a state that can be unbanned",
        details: {
          reason: AdminSchemas.AdminErrorReason.ModerationTargetStateConflict,
          targetState: { status: listing.status },
        },
      });
    }

    // 2. Execute mutation + audit in one transaction
    const result = await this.moderation.run(async (tx) => {
      const unbanResult = await tx.listings.unbanBannedListing(input.listingId);

      const auditRow = await tx.audit.create(
        {
          actorId: input.adminUserId,
          action: AdminSchemas.AdminAuditAction.ListingUnban,
          targetType: "listing",
          targetId: input.listingId,
          details: {
            reason: input.reason,
            before: { status: "banned" },
            after: { status: unbanResult.status },
          },
        },
      );

      return {
        targetId: input.listingId,
        targetState: { status: unbanResult.status },
        auditLogId: auditRow.id,
      };
    });

    return result;
  }
}
