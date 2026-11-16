import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import { Listing } from "../domain/Listing";
import { UPLOAD_CLAIM_PORT, type UploadClaimPort } from "../domain/ports/UploadClaimPort";
import type { ListingPublication, ListingPublicationInput } from "../application/ports/ListingPublication";

@Injectable()
export class PrismaListingPublication implements ListingPublication {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UPLOAD_CLAIM_PORT) private readonly claims: UploadClaimPort,
  ) {}

  async publish(input: ListingPublicationInput): Promise<Listing> {
    const { listing, draftId, photos } = input;
    const listingRow = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${listing.sellerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM listing_drafts WHERE id = ${draftId} FOR UPDATE`;
      await this.claims.finalize(tx, {
        token: input.claimToken,
        uploadIds: photos.map((photo) => photo.uploadId),
        target: { type: "listing", id: listing.id },
      });
      const created = await tx.listing.create({
        data: {
          id: listing.id,
          sellerId: listing.sellerId,
          status: listing.status,
          brandId: listing.brandId,
          modelId: listing.modelId,
          generationId: listing.generationId ?? null,
          year: listing.year ?? null,
          vin: listing.vin ?? null,
          cityId: listing.cityId,
          regionId: listing.regionId ?? null,
          priceAmount: listing.priceAmount,
          priceCurrency: listing.priceCurrency,
          contactPhone: listing.contactPhone ?? null,
          allowCalls: listing.allowCalls,
          allowChat: listing.allowChat,
          publishedAt: listing.publishedAt,
          condition: listing.condition ?? null,
          colorId: listing.colorId ?? null,
          bodyTypeId: listing.bodyTypeId ?? null,
          engineTypeId: listing.engineTypeId ?? null,
          transmissionId: listing.transmissionId ?? null,
          driveTypeId: listing.driveTypeId ?? null,
          enginePower: listing.enginePower ?? null,
          mileageKm: listing.mileageKm ?? null,
          locationText: listing.locationText ?? null,
          description: listing.description ?? null,
          priceTmt: input.priceTmt,
          acceptsExchange: listing.acceptsExchange ?? false,
          installmentAvailable: listing.installmentAvailable ?? false,
          damaged: listing.conditionDisclosure?.damaged ?? null,
          knownIssuesText: listing.conditionDisclosure?.knownIssuesText ?? null,
        },
      });
      for (const photo of photos) {
        await tx.listingMedia.create({
          data: { ...photo, listingId: listing.id, kind: "image", thumbHash: photo.thumbHash ?? null },
        });
      }
      await tx.listingVideo.updateMany({
        where: { draftId, ownerId: listing.sellerId },
        data: { draftId: null, listingId: listing.id },
      });
      await tx.listingDraft.delete({ where: { id: draftId } });
      await tx.auditLog.create({
        data: {
          actorId: listing.sellerId,
          action: "listing.published",
          targetType: "Listing",
          targetId: listing.id,
          details: {
            brandId: listing.brandId,
            modelId: listing.modelId,
            cityId: listing.cityId,
            priceAmount: listing.priceAmount,
            priceCurrency: listing.priceCurrency,
          },
        },
      });
      return created;
    });

    return Listing.create({
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
      publishedAt: listingRow.publishedAt ?? input.listing.publishedAt,
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
  }
}
