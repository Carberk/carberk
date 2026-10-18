import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";

import { Listing } from "../domain/Listing";
import type { FeedRankingPort } from "../domain/ports/FeedRankingPort";
import {
  EXCHANGE_RATE_PORT,
  type ExchangeRatePort,
} from "../domain/ports/ExchangeRatePort";
import {
  DomainError,
  LISTING_ERROR_CODES,
  type Currency,
  type FeedCountSummary,
  type FeedCursor,
  type FeedSort,
  type ListingFilterCriteria,
} from "../domain/types";

type SortKey = "publishedAt" | "priceTmt" | "year" | "mileageKm";
type Direction = "asc" | "desc";

/**
 * Each order pages by `(key, id)` in one direction. Every key has a
 * `(status, key, id)` index (`publishedAt` uses `(status, publishedAt DESC)`).
 * Listings without the key come after all others, still ordered by id.
 */
const SORT_SPECS: Record<FeedSort, { key: SortKey; direction: Direction }> = {
  newest: { key: "publishedAt", direction: "desc" },
  price_asc: { key: "priceTmt", direction: "asc" },
  price_desc: { key: "priceTmt", direction: "desc" },
  year_desc: { key: "year", direction: "desc" },
  year_asc: { key: "year", direction: "asc" },
  mileage_asc: { key: "mileageKm", direction: "asc" },
};

type ListingRow = Prisma.ListingGetPayload<{
  include: { media: true };
}>;

/**
 * Public feed per ADR-0021: active, non-deleted Listings in one of the six
 * orders, paged by keyset. Nullable keys are read in two index-ordered phases
 * (Listings with the key, then Listings without it) so nulls stay last in both
 * directions without a sort over the whole feed.
 */
@Injectable()
export class SortedFeedRankingAdapter implements FeedRankingPort {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EXCHANGE_RATE_PORT)
    private readonly exchangeRates: ExchangeRatePort,
  ) {}

  async rank(query: {
    viewerId?: string;
    filters?: ListingFilterCriteria;
    sort: FeedSort;
    cursor?: FeedCursor;
    limit: number;
  }): Promise<{ items: Listing[]; nextCursor?: FeedCursor }> {
    const { cursor, sort, limit } = query;
    if (cursor && cursor.sort !== sort) {
      throw new DomainError(
        LISTING_ERROR_CODES.INVALID_FEED_CURSOR,
        `Cursor for "${cursor.sort}" cannot page "${sort}"`,
      );
    }

    const { key, direction } = SORT_SPECS[sort];
    const take = limit + 1;
    const base = await this.buildConditions(query.filters);
    const rows: ListingRow[] = [];

    if (!cursor || cursor.value !== null) {
      rows.push(
        ...(await this.prisma.listing.findMany({
          where: {
            AND: [
              ...base,
              { [key]: { not: null } },
              ...(cursor && cursor.value !== null
                ? this.afterValue(key, direction, cursor.value, cursor.id)
                : []),
            ],
          },
          orderBy: [{ [key]: direction }, { id: direction }],
          take,
          include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
        })),
      );
    }

    if (key !== "publishedAt" && rows.length < take) {
      const afterId =
        cursor?.value === null
          ? [{ id: direction === "asc" ? { gt: cursor.id } : { lt: cursor.id } }]
          : [];
      rows.push(
        ...(await this.prisma.listing.findMany({
          where: { AND: [...base, { [key]: null }, ...afterId] },
          // Every key here is NULL; ordering by it too matches the (status, key, id)
          // index so Postgres reads it in order instead of sorting or using the pkey.
          orderBy: [{ [key]: direction }, { id: direction }],
          take: take - rows.length,
          include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
        })),
      );
    }

    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const result: { items: Listing[]; nextCursor?: FeedCursor } = {
      items: items.map((r) => this.toDomain(r)),
    };
    if (rows.length > limit && last) {
      result.nextCursor = this.cursorAfter(sort, key, last);
    }
    return result;
  }

  async count(query: { filters?: ListingFilterCriteria }): Promise<FeedCountSummary> {
    const where = { AND: await this.buildConditions(query.filters) };
    const summary = await this.prisma.listing.aggregate({
      where,
      _count: { _all: true },
      _min: { priceTmt: true },
      _max: { priceTmt: true },
    });
    return {
      totalMatching: summary._count._all,
      priceMinTmt: summary._min.priceTmt,
      priceMaxTmt: summary._max.priceTmt,
    };
  }

  async modelCounts(query: {
    filters: ListingFilterCriteria & { brandId: string };
  }): Promise<Array<{ modelId: string; totalMatching: number }>> {
    const countFilters: ListingFilterCriteria = { ...query.filters };
    delete countFilters.modelId;
    delete countFilters.modelIds;

    const rows = await this.prisma.listing.groupBy({
      by: ["modelId"],
      where: { AND: await this.buildConditions(countFilters) },
      _count: { modelId: true },
      orderBy: [{ _count: { modelId: "desc" } }, { modelId: "asc" }],
    });

    return rows.map((row) => ({
      modelId: row.modelId,
      totalMatching: row._count.modelId,
    }));
  }

  async brandCounts(query: {
    filters?: ListingFilterCriteria;
  }): Promise<Array<{ brandId: string; totalMatching: number }>> {
    const countFilters: ListingFilterCriteria = { ...query.filters };
    delete countFilters.brandId;
    delete countFilters.modelId;
    delete countFilters.modelIds;

    const rows = await this.prisma.listing.groupBy({
      by: ["brandId"],
      where: { AND: await this.buildConditions(countFilters) },
      _count: { brandId: true },
      orderBy: [{ _count: { brandId: "desc" } }, { brandId: "asc" }],
    });

    return rows.map((row) => ({
      brandId: row.brandId,
      totalMatching: row._count.brandId,
    }));
  }

  /**
   * Rows strictly after `(value, id)` in the order. The redundant `lte`/`gte`
   * bound lets Postgres start the index scan at the cursor instead of filtering
   * every earlier row.
   */
  private afterValue(
    key: SortKey,
    direction: Direction,
    rawValue: string | number,
    id: string,
  ): Prisma.ListingWhereInput[] {
    const value = key === "publishedAt" ? new Date(rawValue) : rawValue;
    const [bound, past, pastId] =
      direction === "desc" ? (["lte", "lt", "lt"] as const) : (["gte", "gt", "gt"] as const);
    return [
      { [key]: { [bound]: value } },
      { OR: [{ [key]: { [past]: value } }, { [key]: value, id: { [pastId]: id } }] },
    ];
  }

  private cursorAfter(sort: FeedSort, key: SortKey, row: ListingRow): FeedCursor {
    if (sort === "newest") {
      return { sort, value: (row.publishedAt as Date).toISOString(), id: row.id };
    }
    const value = row[key as Exclude<SortKey, "publishedAt">];
    return { sort, value: value ?? null, id: row.id };
  }

  private async buildConditions(
    filters: ListingFilterCriteria | undefined,
  ): Promise<Prisma.ListingWhereInput[]> {
    const conditions: Prisma.ListingWhereInput[] = [
      { deletedAt: null },
      { status: "active" },
      { OR: [{ businessId: null }, { business: { status: "active" } }] },
    ];

    if (filters?.brandId) {
      conditions.push({ brandId: filters.brandId });
    }
    if (filters?.modelId) {
      conditions.push({ modelId: filters.modelId });
    }
    if (filters?.modelIds && filters.modelIds.length > 0) {
      conditions.push({ modelId: { in: filters.modelIds } });
    }
    if (filters?.cityId) {
      conditions.push({ cityId: filters.cityId });
    }
    if (filters?.sellerType) conditions.push({ businessId: filters.sellerType === "business" ? { not: null } : null });
    if (filters?.condition) {
      conditions.push({ condition: filters.condition });
    }

    if (filters?.yearMin !== undefined || filters?.yearMax !== undefined) {
      conditions.push({
        year: {
          ...(filters.yearMin !== undefined ? { gte: filters.yearMin } : {}),
          ...(filters.yearMax !== undefined ? { lte: filters.yearMax } : {}),
        },
      });
    }

    if (filters?.priceMin !== undefined || filters?.priceMax !== undefined) {
      const priceOr = await this.buildPriceFilter(filters.priceMin, filters.priceMax);
      if (priceOr.length > 0) {
        conditions.push({ OR: priceOr });
      }
    }

    return conditions;
  }

  private async buildPriceFilter(
    priceMin?: number,
    priceMax?: number,
  ): Promise<Array<Prisma.ListingWhereInput>> {
    const rates = await this.exchangeRates.listAll();
    const rateMap = new Map<string, number>();
    for (const r of rates) {
      rateMap.set(`${r.fromCurrency}->${r.toCurrency}`, r.rate);
    }

    const currencies: Currency[] = ["TMT", "USD", "AED"];
    const branches: Array<Prisma.ListingWhereInput> = [];

    for (const currency of currencies) {
      let min: number | undefined;
      let max: number | undefined;

      if (currency === "TMT") {
        min = priceMin;
        max = priceMax;
      } else {
        const rate = rateMap.get(`${currency}->TMT`);
        if (!rate || rate <= 0) {
          continue;
        }
        min = priceMin !== undefined ? priceMin / rate : undefined;
        max = priceMax !== undefined ? priceMax / rate : undefined;
      }

      branches.push({
        priceCurrency: currency,
        ...(min !== undefined || max !== undefined
          ? {
              priceAmount: {
                ...(min !== undefined ? { gte: min } : {}),
                ...(max !== undefined ? { lte: max } : {}),
              },
            }
          : {}),
      });
    }

    return branches;
  }

  private toDomain(row: ListingRow): Listing {
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
      ...(row.mileageKm !== null ? { mileageKm: row.mileageKm } : {}),
      ...(row.locationText ? { locationText: row.locationText } : {}),
      ...(row.description ? { description: row.description } : {}),
      acceptsExchange: row.acceptsExchange,
      installmentAvailable: row.installmentAvailable,
      ...(row.media[0]?.key ? { coverMediaKey: row.media[0].key } : {}),
    });
  }
}
