import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, recomputeListingPricesTmt } from "@auto-tm/db";

import { Listing } from "../domain/Listing";
import type { ListingRepository } from "../domain/ports/ListingRepository";

function n<T>(v: T | undefined): T | null {
  return v ?? null;
}

@Injectable()
export class PrismaListingRepository implements ListingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(listing: Listing): Promise<Listing> {
    const row = await this.prisma.listing.create({
      data: {
        id: listing.id,
        sellerId: listing.sellerId,
        status: listing.status,
        brandId: listing.brandId,
        modelId: listing.modelId,
        generationId: n(listing.generationId),
        year: n(listing.year),
        vin: n(listing.vin),
        cityId: listing.cityId,
        regionId: n(listing.regionId),
        priceAmount: listing.priceAmount,
        priceCurrency: listing.priceCurrency,
        contactPhone: n(listing.contactPhone),
        allowCalls: listing.allowCalls,
        allowChat: listing.allowChat,
        publishedAt: n(listing.publishedAt),
        soldAt: n(listing.soldAt),
        deletedAt: n(listing.deletedAt),
        condition: n(listing.condition),
        colorId: n(listing.colorId),
        bodyTypeId: n(listing.bodyTypeId),
        engineTypeId: n(listing.engineTypeId),
        transmissionId: n(listing.transmissionId),
        driveTypeId: n(listing.driveTypeId),
        enginePower: n(listing.enginePower),
        mileageKm: n(listing.mileageKm),
        locationText: n(listing.locationText),
        description: n(listing.description),
        acceptsExchange: listing.acceptsExchange,
        installmentAvailable: listing.installmentAvailable,
        viewCount: listing.viewCount,
        favoriteCount: listing.favoriteCount,
        damaged: n(listing.conditionDisclosure?.damaged),
        knownIssuesText: n(listing.conditionDisclosure?.knownIssuesText),
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      },
    });
    return this.toDomain(row);
  }

  async findById(id: string): Promise<Listing | null> {
    const row = await this.prisma.listing.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findBySellerId(
    sellerId: string,
    opts?: { cursor?: { timestamp: string; id: string }; limit?: number },
  ): Promise<{ items: Listing[]; nextCursor?: { timestamp: string; id: string } }> {
    const take = (opts?.limit ?? 20) + 1;

    const rows = await this.prisma.listing.findMany({
      where: { sellerId, deletedAt: null },
      take,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...(opts?.cursor
        ? {
            skip: 1,
            cursor: { id: opts.cursor.id },
          }
        : {}),
    });

    const hasMore = rows.length === take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];
    const result: { items: Listing[]; nextCursor?: { timestamp: string; id: string } } = {
      items: items.map((r) => this.toDomain(r)),
    };
    if (hasMore && last) {
      result.nextCursor = { timestamp: last.updatedAt.toISOString(), id: last.id };
    }
    return result;
  }

  async update(listing: Listing, derived?: { priceTmt: number }): Promise<Listing> {
    const row = await this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        ...(derived !== undefined ? { priceTmt: derived.priceTmt } : {}),
        status: listing.status,
        brandId: listing.brandId,
        modelId: listing.modelId,
        generationId: n(listing.generationId),
        year: n(listing.year),
        vin: n(listing.vin),
        cityId: listing.cityId,
        regionId: n(listing.regionId),
        priceAmount: listing.priceAmount,
        priceCurrency: listing.priceCurrency,
        contactPhone: n(listing.contactPhone),
        allowCalls: listing.allowCalls,
        allowChat: listing.allowChat,
        publishedAt: n(listing.publishedAt),
        soldAt: n(listing.soldAt),
        deletedAt: n(listing.deletedAt),
        condition: n(listing.condition),
        colorId: n(listing.colorId),
        bodyTypeId: n(listing.bodyTypeId),
        engineTypeId: n(listing.engineTypeId),
        transmissionId: n(listing.transmissionId),
        driveTypeId: n(listing.driveTypeId),
        enginePower: n(listing.enginePower),
        mileageKm: n(listing.mileageKm),
        locationText: n(listing.locationText),
        description: n(listing.description),
        acceptsExchange: listing.acceptsExchange,
        installmentAvailable: listing.installmentAvailable,
        damaged: n(listing.conditionDisclosure?.damaged),
        knownIssuesText: n(listing.conditionDisclosure?.knownIssuesText),
      },
    });
    return this.toDomain(row);
  }

  async recomputePriceTmt(): Promise<number> {
    return recomputeListingPricesTmt(this.prisma);
  }

  async softDelete(id: string, at: Date): Promise<void> {
    await this.prisma.listing.update({
      where: { id },
      data: { deletedAt: at },
    });
  }

  private toDomain(row: {
    id: string;
    publicNumber: number;
    sellerId: string;
    status: string;
    brandId: string;
    modelId: string;
    generationId: string | null;
    year: number | null;
    vin: string | null;
    cityId: string;
    regionId: string | null;
    priceAmount: number;
    priceCurrency: string;
    contactPhone: string | null;
    allowCalls: boolean;
    allowChat: boolean;
    publishedAt: Date | null;
    soldAt: Date | null;
    deletedAt: Date | null;
    condition: string | null;
    colorId: string | null;
    bodyTypeId: string | null;
    engineTypeId: string | null;
    transmissionId: string | null;
    driveTypeId: string | null;
    enginePower: number | null;
    mileageKm: number | null;
    locationText: string | null;
    description: string | null;
    viewCount: number;
    favoriteCount: number;
    acceptsExchange: boolean;
    installmentAvailable: boolean;
    damaged: boolean | null;
    knownIssuesText: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Listing {
    return Listing.create({
      id: row.id,
      publicNumber: row.publicNumber,
      sellerId: row.sellerId,
      status: row.status as "active" | "sold" | "archived" | "banned",
      brandId: row.brandId,
      modelId: row.modelId,
      cityId: row.cityId,
      priceAmount: row.priceAmount,
      priceCurrency: row.priceCurrency as "TMT" | "USD" | "AED",
      allowCalls: row.allowCalls,
      allowChat: row.allowChat,
      publishedAt: row.publishedAt ?? new Date(),
      viewCount: row.viewCount,
      favoriteCount: row.favoriteCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.generationId ? { generationId: row.generationId } : {}),
      ...(row.year ? { year: row.year } : {}),
      ...(row.vin ? { vin: row.vin } : {}),
      ...(row.regionId ? { regionId: row.regionId } : {}),
      ...(row.contactPhone ? { contactPhone: row.contactPhone } : {}),
      ...(row.soldAt ? { soldAt: row.soldAt } : {}),
      ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
      ...(row.condition ? { condition: row.condition as "new" | "used" } : {}),
      ...(row.colorId ? { colorId: row.colorId } : {}),
      ...(row.bodyTypeId ? { bodyTypeId: row.bodyTypeId } : {}),
      ...(row.engineTypeId ? { engineTypeId: row.engineTypeId } : {}),
      ...(row.transmissionId ? { transmissionId: row.transmissionId } : {}),
      ...(row.driveTypeId ? { driveTypeId: row.driveTypeId } : {}),
      ...(row.enginePower ? { enginePower: row.enginePower } : {}),
      ...(row.mileageKm ? { mileageKm: row.mileageKm } : {}),
      ...(row.locationText ? { locationText: row.locationText } : {}),
      ...(row.description ? { description: row.description } : {}),
      acceptsExchange: row.acceptsExchange,
      installmentAvailable: row.installmentAvailable,
      // A Listing without a Damaged answer has no disclosure to show.
      ...(row.damaged !== null
        ? {
            conditionDisclosure: {
              damaged: row.damaged,
              ...(row.knownIssuesText !== null ? { knownIssuesText: row.knownIssuesText } : {}),
            },
          }
        : {}),
    });
  }
}
