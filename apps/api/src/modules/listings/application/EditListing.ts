import { Optional , Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { ListingOwnership, assertListingOwnership } from "./ListingOwnership";
import { PrismaService } from "@auto-tm/db";

import {
  IDENTITY_CLOCK_PORT,
  type ClockPort,
} from "../../identity/identity.public";
import { ContactPhonePolicy } from "../domain/ContactPhonePolicy";
import { Listing } from "../domain/Listing";
import { toPriceTmt } from "../domain/Price";
import { resolveDamagedAnswer } from "../domain/damagedAnswer";
import { DomainError, LISTING_ERROR_CODES, LOCKED_FIELDS } from "../domain/types";
import type { ConditionDisclosure } from "../domain/types";
import { ListingsSchemas } from "@auto-tm/contracts";
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  EXCHANGE_RATE_PORT,
  type ExchangeRatePort,
} from "../domain/ports/ExchangeRatePort";
import {
  LISTING_EVENT_PUBLISHER,
  type ListingEventPublisher,
} from "../domain/ports/ListingEventPublisher";

import { contactPhoneRejection } from "./contactPhoneRejection";

export interface EditListingInput {
  listingId: string;
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
  patch: typeof ListingsSchemas.EditListingRequestSchema._type;
}

export interface EditListingResult {
  listing: Listing;
}

@Injectable()
export class EditListing {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_RATE_PORT)
    private readonly exchangeRates: ExchangeRatePort,
    @Inject(LISTING_EVENT_PUBLISHER)
    private readonly events: ListingEventPublisher,
    @Inject(ContactPhonePolicy)
    private readonly contactPhones: ContactPhonePolicy,
    @Inject(IDENTITY_CLOCK_PORT)
    private readonly clock: ClockPort,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: EditListingInput): Promise<EditListingResult> {
    const existing = await this.listings.findById(input.listingId);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException("Listing not found");
    }
    if (!existing.businessId && existing.sellerId !== input.userId) throw new NotFoundException("Resource not found");
    await assertListingOwnership(this.ownership, input, existing);
    if (existing.status === "banned") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is banned and cannot be edited",
      });
    }

    const photoCount = await this.prisma.listingMedia.count({
      where: { listingId: existing.id, kind: "image" },
    });
    if (photoCount < ListingsSchemas.MIN_LISTING_PHOTOS) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.PHOTO_MINIMUM_REQUIRED,
        message: `At least ${ListingsSchemas.MIN_LISTING_PHOTOS} photos are required`,
        details: { minimum: ListingsSchemas.MIN_LISTING_PHOTOS },
      });
    }

    const patch = input.patch;
    const now = this.clock.now();

    // Defense-in-depth: reject locked fields
    for (const field of Object.keys(patch)) {
      if (
        LOCKED_FIELDS.includes(field as (typeof LOCKED_FIELDS)[number]) &&
        (patch as Record<string, unknown>)[field] !==
          (existing as unknown as Record<string, unknown>)[field]
      ) {
        throw new BadRequestException({
          code: LISTING_ERROR_CODES.LISTING_FIELD_LOCKED,
          message: `Field "${field}" cannot be changed after publish.`,
          details: { field },
        });
      }
    }

    // Validate contact methods if either is touched
    if (
      (patch.allowCalls !== undefined || patch.allowChat !== undefined) &&
      !(patch.allowCalls ?? existing.allowCalls) &&
      !(patch.allowChat ?? existing.allowChat)
    ) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.CONTACT_METHOD_REQUIRED,
        message: "At least one contact method must be enabled",
      });
    }

    // ADR-0081: only a new number is checked. Other edits, calls and chat
    // included, keep the stored number after its 7 days, or none if it was
    // cleared.
    if (patch.contactPhone !== undefined && patch.contactPhone !== existing.contactPhone) {
      const rejection = contactPhoneRejection(
        await this.contactPhones.standing(existing.sellerId, patch.contactPhone, now, existing.businessId),
      );
      if (rejection) throw rejection;
    }

    // The saved price needs a current rate to TMT: it re-derives priceTmt.
    const newCurrency = patch.priceCurrency ?? existing.priceCurrency;
    const rateToTmt =
      newCurrency === "TMT" ? 1 : await this.exchangeRates.getRate(newCurrency, "TMT");
    if (rateToTmt <= 0) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.EXCHANGE_RATE_MISSING,
        message: `Exchange rate from ${newCurrency} to TMT is not available`,
      });
    }

    const oldPriceAmount = existing.priceAmount;
    const oldPriceCurrency = existing.priceCurrency;

    const nextConditionDisclosure = mergeConditionDisclosure(
      existing.conditionDisclosure,
      patch.conditionDisclosure,
    );
    // ADR-0052 and ADR-0080: a Used Listing keeps a Damaged answer through
    // every edit; a New Listing stores not damaged.
    const damagedAnswer = resolveDamagedAnswer(
      patch.condition ?? existing.condition,
      nextConditionDisclosure?.damaged,
    );
    if (!damagedAnswer.ok) {
      throw new BadRequestException({
        code: damagedAnswer.code,
        message: damagedAnswer.message,
        details: { field: "conditionDisclosure.damaged" },
      });
    }

    // Build updated listing data
    const updatedData: Parameters<typeof Listing.create>[0] = {
      id: existing.id,
      publicNumber: existing.publicNumber,
      sellerId: existing.sellerId,
      ...(existing.businessId ? { businessId: existing.businessId } : {}),
      status: existing.status,
      brandId: existing.brandId,
      modelId: existing.modelId,
      cityId: existing.cityId,
      priceAmount: existing.priceAmount,
      priceCurrency: existing.priceCurrency,
      allowCalls: existing.allowCalls,
      allowChat: existing.allowChat,
      publishedAt: existing.publishedAt,
      viewCount: existing.viewCount,
      favoriteCount: existing.favoriteCount,
      createdAt: existing.createdAt,
      updatedAt: now,
      ...(existing.generationId !== undefined && { generationId: existing.generationId }),
      ...(existing.year !== undefined && { year: existing.year }),
      ...(existing.vin !== undefined && { vin: existing.vin }),
      ...(existing.regionId !== undefined && { regionId: existing.regionId }),
      ...(existing.contactPhone !== undefined && { contactPhone: existing.contactPhone }),
      ...(existing.soldAt !== undefined && { soldAt: existing.soldAt }),
      ...(existing.deletedAt !== undefined && { deletedAt: existing.deletedAt }),
      ...(existing.condition !== undefined && { condition: existing.condition }),
      ...(existing.colorId !== undefined && { colorId: existing.colorId }),
      ...(existing.bodyTypeId !== undefined && { bodyTypeId: existing.bodyTypeId }),
      ...(existing.engineTypeId !== undefined && { engineTypeId: existing.engineTypeId }),
      ...(existing.transmissionId !== undefined && { transmissionId: existing.transmissionId }),
      ...(existing.driveTypeId !== undefined && { driveTypeId: existing.driveTypeId }),
      ...(existing.enginePower !== undefined && { enginePower: existing.enginePower }),
      ...(existing.mileageKm !== undefined && { mileageKm: existing.mileageKm }),
      ...(existing.locationText !== undefined && { locationText: existing.locationText }),
      ...(existing.description !== undefined && { description: existing.description }),
      ...(patch.priceAmount !== undefined && { priceAmount: patch.priceAmount }),
      ...(patch.priceCurrency !== undefined && { priceCurrency: patch.priceCurrency }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.condition !== undefined && { condition: patch.condition }),
      ...(patch.mileageKm !== undefined && { mileageKm: patch.mileageKm }),
      ...(patch.colorId !== undefined && { colorId: patch.colorId }),
      ...(patch.bodyTypeId !== undefined && { bodyTypeId: patch.bodyTypeId }),
      ...(patch.transmissionId !== undefined && { transmissionId: patch.transmissionId }),
      ...(patch.driveTypeId !== undefined && { driveTypeId: patch.driveTypeId }),
      ...(patch.engineTypeId !== undefined && { engineTypeId: patch.engineTypeId }),
      ...(patch.enginePower !== undefined && { enginePower: patch.enginePower }),
      ...(patch.regionId !== undefined && { regionId: patch.regionId }),
      ...(patch.cityId !== undefined && { cityId: patch.cityId }),
      ...(patch.locationText !== undefined && { locationText: patch.locationText }),
      ...(patch.contactPhone !== undefined && { contactPhone: patch.contactPhone }),
      ...(patch.allowCalls !== undefined && { allowCalls: patch.allowCalls }),
      ...(patch.allowChat !== undefined && { allowChat: patch.allowChat }),
      ...(patch.acceptsExchange !== undefined && { acceptsExchange: patch.acceptsExchange }),
      ...(patch.installmentAvailable !== undefined && { installmentAvailable: patch.installmentAvailable }),
      conditionDisclosure: {
        damaged: damagedAnswer.damaged,
        ...(nextConditionDisclosure?.knownIssuesText !== undefined && {
          knownIssuesText: nextConditionDisclosure.knownIssuesText,
        }),
      },
    };

    let updated: Listing;
    try {
      updated = Listing.create(updatedData);
    } catch (err) {
      if (err instanceof DomainError) {
        throw new BadRequestException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }

    const saved = await this.listings.update(updated, {
      priceTmt: toPriceTmt(updated.priceAmount, updated.priceCurrency, rateToTmt),
    }, input);

    const priceChanged =
      saved.priceAmount !== oldPriceAmount || saved.priceCurrency !== oldPriceCurrency;
    if (priceChanged) {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.userId,
          action: "listing.price_changed",
          targetType: "Listing",
          targetId: saved.id,
          details: {
            oldPriceAmount,
            oldPriceCurrency,
            newPriceAmount: saved.priceAmount,
            newPriceCurrency: saved.priceCurrency,
          },
        },
      });
    }

    await this.events.emit({
      event: "ListingUpdated",
      listingId: saved.id,
    });

    return { listing: saved };
  }
}

function mergeConditionDisclosure(
  existing: ConditionDisclosure | undefined,
  patch: Partial<ConditionDisclosure> | undefined,
): Partial<ConditionDisclosure> | undefined {
  if (!existing && !patch) return undefined;
  if (!patch) return existing;

  const damaged = patch.damaged ?? existing?.damaged;
  // A disclosure patch replaces its optional text; omission clears Known issues.
  const knownIssuesText = patch.knownIssuesText;
  return {
    ...(damaged !== undefined && { damaged }),
    ...(knownIssuesText !== undefined && { knownIssuesText }),
  };
}
