import { LISTING_MEDIA_COUNTS, type ListingMediaCounts } from "./ports/ListingMediaCounts";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { LISTING_AUDIT_LOG, type ListingAuditLog } from "./ports/ListingAuditLog";
import { ListingsSchemas } from "@auto-tm/contracts";

import {
  IDENTITY_CLOCK_PORT,
  type ClockPort,
} from "../../identity/identity.public";
import { ContactPhonePolicy } from "../domain/ContactPhonePolicy";
import type { Listing } from "../domain/Listing";
import { toPriceTmt } from "../domain/Price";
import { LISTING_ERROR_CODES } from "../domain/types";
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  EXCHANGE_RATE_PORT,
  type ExchangeRatePort,
} from "../domain/ports/ExchangeRatePort";

import { contactPhoneRejection } from "./contactPhoneRejection";

export interface RepublishListingInput {
  listingId: string;
  userId: string;
}

export interface RepublishListingResult {
  listing: Listing;
}

@Injectable()
export class RepublishListing {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_AUDIT_LOG)
    private readonly audit: ListingAuditLog,
    @Inject(EXCHANGE_RATE_PORT)
    private readonly exchangeRates: ExchangeRatePort,
    @Inject(ContactPhonePolicy)
    private readonly contactPhones: ContactPhonePolicy,
    @Inject(IDENTITY_CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(LISTING_MEDIA_COUNTS)
    private readonly mediaCounts: ListingMediaCounts,
  ) {}

  async execute(input: RepublishListingInput): Promise<RepublishListingResult> {
    const existing = await this.listings.findById(input.listingId);
    if (!existing) {
      throw new NotFoundException("Listing not found");
    }
    if (existing.sellerId !== input.userId) {
      throw new ForbiddenException("Not the owner of this listing");
    }
    if (existing.deletedAt) {
      throw new NotFoundException("Listing not found");
    }
    if (existing.status === "banned") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is banned and cannot be republished",
      });
    }

    const photoCount = await this.mediaCounts.count(existing.id, "image");
    if (photoCount < ListingsSchemas.MIN_LISTING_PHOTOS) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.PHOTO_MINIMUM_REQUIRED,
        message: `At least ${ListingsSchemas.MIN_LISTING_PHOTOS} photos are required`,
        details: { minimum: ListingsSchemas.MIN_LISTING_PHOTOS },
      });
    }

    const now = this.clock.now();
    const previousArchivedAt = existing.status === "archived" ? existing.updatedAt : undefined;
    const updated = existing.republish(now);

    // The stored number must still be usable; to relist with another number
    // the seller edits first (ADR-0081).
    const rejection = contactPhoneRejection(
      await this.contactPhones.standing(existing.sellerId, existing.contactPhone, now),
    );
    if (rejection) throw rejection;

    // Back in the feed at today's rate, so price sort and range stay current.
    const rateToTmt =
      updated.priceCurrency === "TMT"
        ? 1
        : await this.exchangeRates.getRate(updated.priceCurrency, "TMT");
    if (rateToTmt <= 0) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.EXCHANGE_RATE_MISSING,
        message: `Exchange rate from ${updated.priceCurrency} to TMT is not available`,
      });
    }
    const saved = await this.listings.update(updated, {
      priceTmt: toPriceTmt(updated.priceAmount, updated.priceCurrency, rateToTmt),
    });

    await this.audit.record({
      actorId: input.userId,
      action: "listing.republished",
      targetType: "Listing",
      targetId: saved.id,
      details: {
        previousArchivedAt: previousArchivedAt?.toISOString() ?? null,
      },
    });

    return { listing: saved };
  }
}
