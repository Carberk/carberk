import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { ListingsSchemas } from "@auto-tm/contracts";
import type { z } from "zod";

import { Listing } from "../domain/Listing";
import { toPriceTmt } from "../domain/Price";
import { DomainError, LISTING_ERROR_CODES } from "../domain/types";
import {
  LISTING_DRAFT_REPOSITORY,
  type ListingDraftRepository,
} from "../domain/ports/ListingDraftRepository";
import {
  EXCHANGE_RATE_PORT,
  type ExchangeRatePort,
} from "../domain/ports/ExchangeRatePort";
import {
  LISTING_EVENT_PUBLISHER,
  type ListingEventPublisher,
} from "../domain/ports/ListingEventPublisher";
import {
  IMAGE_VARIANT_GENERATOR,
  type ImageVariantGenerator,
} from "../domain/ports/ImageVariantGenerator";

import { UploadAdoptionGuard } from "./UploadAdoptionGuard";

const PublishablePayloadSchema = ListingsSchemas.ListingDraftPayloadSchema.required({
  brandId: true,
  modelId: true,
  year: true,
  cityId: true,
  regionId: true,
  priceAmount: true,
  priceCurrency: true,
  condition: true,
  description: true,
  allowCalls: true,
  allowChat: true,
}).refine(
  (data) => data.allowCalls || data.allowChat,
  { message: "CONTACT_METHOD_REQUIRED" },
).refine(
  (data) => data.photos && data.photos.length >= 1 && data.photos.some((p) => p.key),
  { message: "AT_LEAST_ONE_PHOTO_REQUIRED" },
).refine(
  (data) => data.description.trim().length > 0,
  { message: "DESCRIPTION_REQUIRED" },
).refine(
  (data) => {
    if (data.condition === "used") {
      return data.mileageKm !== undefined && data.mileageKm !== null;
    }
    return true;
  },
  { message: "MILEAGE_REQUIRED_FOR_USED" },
).refine(
  (data) => data.conditionDisclosure?.damaged !== undefined,
  { message: "DAMAGED_REQUIRED", path: ["conditionDisclosure", "damaged"] },
);

/** Prisma reports a unique-constraint violation as a known request error, code P2002. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

export interface PublishListingInput {
  draftId: string;
  userId: string;
}

export interface PublishListingResult {
  listing: Listing;
}

@Injectable()
export class PublishListing {
  constructor(
    @Inject(LISTING_DRAFT_REPOSITORY)
    private readonly drafts: ListingDraftRepository,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(EXCHANGE_RATE_PORT)
    private readonly exchangeRates: ExchangeRatePort,
    @Inject(LISTING_EVENT_PUBLISHER)
    private readonly events: ListingEventPublisher,
    @Inject(IMAGE_VARIANT_GENERATOR)
    private readonly variantGenerator: ImageVariantGenerator,
    @Inject(UploadAdoptionGuard)
    private readonly uploadGuard: UploadAdoptionGuard,
  ) {}

  async execute(input: PublishListingInput): Promise<PublishListingResult> {
    const draft = await this.drafts.findById(input.draftId);
    if (!draft) {
      throw new NotFoundException("Draft not found");
    }
    if (draft.userId !== input.userId) {
      throw new ForbiddenException("Not the owner of this draft");
    }

    let payload: z.infer<typeof PublishablePayloadSchema>;
    try {
      payload = PublishablePayloadSchema.parse(draft.payload);
    } catch (err) {
      if (err && typeof err === "object" && "issues" in err) {
        const zodError = err as z.ZodError;
        const contactIssue = zodError.issues.find(
          (i) => i.message === "CONTACT_METHOD_REQUIRED",
        );
        if (contactIssue) {
          throw new BadRequestException({
            code: LISTING_ERROR_CODES.CONTACT_METHOD_REQUIRED,
            message: "At least one contact method must be enabled",
          });
        }
        throw new BadRequestException({
          code: "INVALID_DRAFT_PAYLOAD",
          message: "Draft is missing required fields",
          details: zodError.flatten(),
        });
      }
      throw err;
    }

    const rateToTmt =
      payload.priceCurrency === "TMT"
        ? 1
        : await this.exchangeRates.getRate(payload.priceCurrency, "TMT");
    if (rateToTmt <= 0) {
      throw new BadRequestException({
        code: LISTING_ERROR_CODES.EXCHANGE_RATE_MISSING,
        message: `Exchange rate from ${payload.priceCurrency} to TMT is not available`,
      });
    }
    const priceTmt = toPriceTmt(payload.priceAmount, payload.priceCurrency, rateToTmt);

    const now = new Date();
    const listingId = randomUUID();

    const photos = payload.photos;
    if (!photos) throw new BadRequestException({ code: "INVALID_DRAFT_PAYLOAD", message: "Photos are required" });
    const attachedPhotos = photos.filter((photo) => photo.key);

    // A draft's photo keys are only strings. Each must be an upload this User
    // presigned and has not adopted elsewhere (ADR-0077); the unique upload link
    // on the media row below makes that single-use even under a race.
    const photoKeys = attachedPhotos.map((photo) => photo.key as string);
    if (new Set(photoKeys).size !== photoKeys.length) {
      throw new BadRequestException({
        code: "INVALID_DRAFT_PAYLOAD",
        message: "A photo key can be used only once",
      });
    }
    const uploads = await this.uploadGuard.authorize(
      draft.userId,
      photoKeys.map((key) => ({ key, kind: "image" as const })),
    );
    if (uploads.some((upload) => upload.adopted)) {
      throw new ConflictException({
        code: LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
        message: "A photo upload is already attached to a Listing",
      });
    }
    const uploadIdByKey = new Map(uploads.map((upload) => [upload.key, upload.id]));

    await Promise.all(
      attachedPhotos.map((photo) =>
        this.variantGenerator.generate(photo.key as string),
      ),
    );

    try {
      const [listingRow] = await this.prisma.$transaction([
        this.prisma.listing.create({
          data: {
            id: listingId,
            sellerId: input.userId,
            status: "active",
            brandId: payload.brandId,
            modelId: payload.modelId,
            generationId: payload.generationId ?? null,
            year: payload.year ?? null,
            vin: payload.vin ?? null,
            cityId: payload.cityId,
            regionId: payload.regionId ?? null,
            priceAmount: payload.priceAmount,
            priceCurrency: payload.priceCurrency,
            priceTmt,
            contactPhone: payload.contactPhone ?? null,
            allowCalls: payload.allowCalls,
            allowChat: payload.allowChat,
            publishedAt: now,
            condition: payload.condition,
            colorId: payload.colorId ?? null,
            bodyTypeId: payload.bodyTypeId ?? null,
            engineTypeId: payload.engineTypeId ?? null,
            transmissionId: payload.transmissionId ?? null,
            driveTypeId: payload.driveTypeId ?? null,
            enginePower: payload.enginePower ?? null,
            mileageKm: payload.mileageKm ?? null,
            locationText: payload.locationText ?? null,
            description: payload.description,
            acceptsExchange: payload.acceptsExchange ?? false,
            installmentAvailable: payload.installmentAvailable ?? false,
            damaged: payload.conditionDisclosure?.damaged ?? null,
            knownIssuesText: payload.conditionDisclosure?.knownIssuesText ?? null,
          },
        }),
        ...attachedPhotos.map((photo) =>
          this.prisma.listingMedia.create({
            data: {
              id: photo.photoId,
              listingId,
              kind: "image",
              key: photo.key as string,
              sortOrder: photo.sortOrder,
              uploadId: uploadIdByKey.get(photo.key as string) as string,
            },
          }),
        ),
        this.prisma.listingDraft.delete({ where: { id: draft.id } }),
        this.prisma.auditLog.create({
          data: {
            actorId: input.userId,
            action: "listing.published",
            targetType: "Listing",
            targetId: listingId,
            details: {
              brandId: payload.brandId,
              modelId: payload.modelId,
              cityId: payload.cityId,
              priceAmount: payload.priceAmount,
              priceCurrency: payload.priceCurrency,
            },
          },
        }),
      ]);

      const listing = Listing.create({
        id: listingRow.id,
        publicNumber: listingRow.publicNumber,
        sellerId: listingRow.sellerId,
        status: listingRow.status as "active" | "sold" | "archived",
        brandId: listingRow.brandId,
        modelId: listingRow.modelId,
        cityId: listingRow.cityId,
        priceAmount: listingRow.priceAmount,
        priceCurrency: listingRow.priceCurrency as "TMT" | "USD" | "AED",
        allowCalls: listingRow.allowCalls,
        allowChat: listingRow.allowChat,
        publishedAt: listingRow.publishedAt ?? new Date(),
        createdAt: listingRow.createdAt,
        updatedAt: listingRow.updatedAt,
        ...(listingRow.generationId ? { generationId: listingRow.generationId } : {}),
        ...(listingRow.year ? { year: listingRow.year } : {}),
        ...(listingRow.vin ? { vin: listingRow.vin } : {}),
        ...(listingRow.regionId ? { regionId: listingRow.regionId } : {}),
        ...(listingRow.contactPhone ? { contactPhone: listingRow.contactPhone } : {}),
        ...(listingRow.condition ? { condition: listingRow.condition as "new" | "used" } : {}),
        ...(listingRow.colorId ? { colorId: listingRow.colorId } : {}),
        ...(listingRow.bodyTypeId ? { bodyTypeId: listingRow.bodyTypeId } : {}),
        ...(listingRow.engineTypeId ? { engineTypeId: listingRow.engineTypeId } : {}),
        ...(listingRow.transmissionId ? { transmissionId: listingRow.transmissionId } : {}),
        ...(listingRow.driveTypeId ? { driveTypeId: listingRow.driveTypeId } : {}),
        ...(listingRow.enginePower ? { enginePower: listingRow.enginePower } : {}),
        ...(listingRow.mileageKm ? { mileageKm: listingRow.mileageKm } : {}),
        ...(listingRow.locationText ? { locationText: listingRow.locationText } : {}),
        ...(listingRow.description ? { description: listingRow.description } : {}),
        acceptsExchange: listingRow.acceptsExchange,
        installmentAvailable: listingRow.installmentAvailable,
        ...(listingRow.damaged !== null
          ? {
              conditionDisclosure: {
                damaged: listingRow.damaged,
                ...(listingRow.knownIssuesText ? { knownIssuesText: listingRow.knownIssuesText } : {}),
              },
            }
          : {}),
      });

      await this.events.emit({
        event: "ListingCreated",
        listingId: listing.id,
        sellerId: listing.sellerId,
      });

      return { listing };
    } catch (err) {
      if (isUniqueViolation(err) && (await this.uploadGuard.anyAdopted(photoKeys))) {
        // A concurrent attach or publish adopted one of these uploads first. The
        // whole transaction rolled back, so nothing was published.
        throw new ConflictException({
          code: LISTING_ERROR_CODES.UPLOAD_ALREADY_ATTACHED,
          message: "A photo upload is already attached to a Listing",
        });
      }
      if (err instanceof DomainError) {
        throw new BadRequestException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  }
}
