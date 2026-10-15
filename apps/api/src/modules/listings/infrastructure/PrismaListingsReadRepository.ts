import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import {
  CARD_GALLERY_KEY_LIMIT,
  toCardPhotos,
  toCardPhotosFromFirstMedia,
  type CardPhotos,
} from "../domain/CardPhotos";
import { VISIBLE_LISTING_STATUSES } from "../domain/ListingStatus";
import type {
  Currency,
  TimestampCursor,
  MediaKind,
} from "../domain/types";
import type {
  ListingsReadPort,
  ListingSummary,
  AdminListingSummary,
} from "../domain/ports/ListingsReadPort";
import type {
  ListingCard,
  ListingCardReadPort,
} from "../domain/ports/ListingCardReadPort";
import {
  EXCHANGE_RATE_PORT,
  type ExchangeRatePort,
} from "../domain/ports/ExchangeRatePort";

/**
 * One batched media read per query (not per row). A Listing holds at most
 * 20 photos + 1 video, so the full ordered key list stays small.
 */
const CARD_INCLUDE = {
  media: {
    orderBy: { sortOrder: "asc" as const },
    select: { key: true, kind: true, thumbHash: true },
  },
};

type CardRow = {
  id: string;
  sellerId: string;
  status: string;
  brandId: string;
  modelId: string;
  year: number | null;
  priceAmount: number;
  priceCurrency: string;
  cityId: string;
  publishedAt: Date | null;
  mileageKm: number | null;
  condition: string | null;
  transmissionId: string | null;
  engineTypeId: string | null;
  contactPhone: string | null;
  allowCalls: boolean;
  allowChat: boolean;
  enginePower: number | null;
  driveTypeId: string | null;
  bodyTypeId: string | null;
  colorId: string | null;
  vin: string | null;
  acceptsExchange: boolean;
  installmentAvailable: boolean;
  media: Array<{ key: string; kind: MediaKind; thumbHash: string | null }>;
};

type CardPhotoRow = {
  listingId: string;
  key: string;
  kind: MediaKind;
  thumbHash: string | null;
  photoCount: number;
};

@Injectable()
export class PrismaListingsReadRepository
  implements ListingsReadPort, ListingCardReadPort
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EXCHANGE_RATE_PORT)
    private readonly exchangeRates: ExchangeRatePort,
  ) {}

  async getListingSummary(id: string): Promise<ListingSummary | null> {
    const row = await this.prisma.listing.findUnique({
      where: { id, deletedAt: null, OR: [{ businessId: null }, { business: { status: "active" } }] },
      include: CARD_INCLUDE,
    });

    if (!row) return null;
    if (row.deletedAt) return null;
    if (!(VISIBLE_LISTING_STATUSES as readonly string[]).includes(row.status)) {
      return null;
    }

    const [card] = await this.toCards([row]);
    if (!card) return null;
    const summary = toListingSummary(card);
    // The cover is the first media item; only a photo has a hash.
    const cover = row.media[0];
    if (cover?.kind === "image" && cover.thumbHash !== null) summary.coverThumbHash = cover.thumbHash;
    return summary;
  }

  async getListingSummaries(ids: string[]): Promise<ListingSummary[]> {
    return (await this.getVisibleCards(ids)).map(toListingSummary);
  }

  /**
   * One bounded read for the whole page: per Listing only its first media
   * item (the cover), its first `CARD_GALLERY_KEY_LIMIT` photos and its photo
   * total, so the rows sent back stay small whatever a Listing holds. The
   * photo total needs every media row of the page's Listings (at most 21
   * each), and the plan reads exactly those, once, through the
   * `(listingId, sortOrder)` index.
   */
  async getCardPhotos(listingIds: string[]): Promise<Map<string, CardPhotos>> {
    if (listingIds.length === 0) return new Map();

    const rows = await this.prisma.$queryRaw<CardPhotoRow[]>`
      SELECT "listingId", "key", "kind"::text AS "kind", "thumbHash", "photoCount"
      FROM (
        SELECT
          m."listingId",
          m."key",
          m."kind",
          m."thumbHash",
          m."sortOrder",
          m."id",
          ROW_NUMBER() OVER (
            PARTITION BY m."listingId" ORDER BY m."sortOrder", m."id"
          ) AS "position",
          ROW_NUMBER() OVER (
            PARTITION BY m."listingId", m."kind" ORDER BY m."sortOrder", m."id"
          ) AS "kindPosition",
          (COUNT(*) FILTER (WHERE m."kind" = 'image') OVER (PARTITION BY m."listingId"))::int
            AS "photoCount"
        FROM "listing_media" m
        WHERE m."listingId" = ANY(${listingIds}::text[])
      ) ranked
      WHERE "position" = 1
        OR ("kind" = 'image' AND "kindPosition" <= ${CARD_GALLERY_KEY_LIMIT})
      ORDER BY "listingId", "sortOrder", "id"`;

    const byListing = new Map<
      string,
      { photoCount: number; media: Array<{ key: string; kind: MediaKind; thumbHash: string | null }> }
    >();
    for (const row of rows) {
      const entry = byListing.get(row.listingId) ?? { photoCount: row.photoCount, media: [] };
      entry.media.push({ key: row.key, kind: row.kind, thumbHash: row.thumbHash });
      byListing.set(row.listingId, entry);
    }

    return new Map(
      [...byListing].map(([listingId, { media, photoCount }]) => [
        listingId,
        toCardPhotosFromFirstMedia(media, photoCount),
      ]),
    );
  }

  async getVisibleCards(ids: string[]): Promise<ListingCard[]> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.listing.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        status: { in: [...VISIBLE_LISTING_STATUSES] },
        OR: [{ businessId: null }, { business: { status: "active" } }],
      },
      include: CARD_INCLUDE,
    });

    return this.toCards(rows);
  }

  async getListingAdminSummaries(ids: string[]): Promise<AdminListingSummary[]> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.listing.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      include: { brand: true, model: true },
    });

    return rows.map((r) => ({
      id: r.id,
      sellerId: r.sellerId,
      status: r.status,
      year: r.year ?? null,
      brandName: r.brand.nameRu,
      modelName: r.model.nameRu,
    }));
  }

  async getListingsForOwner(
    ownerId: string,
    query?: { cursor?: TimestampCursor; limit?: number },
  ): Promise<{ items: ListingSummary[]; nextCursor?: TimestampCursor }> {
    const result = await this.getOwnerCards(ownerId, query);
    return { ...result, items: result.items.map(toListingSummary) };
  }

  async getOwnerCards(
    ownerId: string,
    query?: { cursor?: TimestampCursor; limit?: number },
  ): Promise<{ items: ListingCard[]; nextCursor?: TimestampCursor }> {
    const take = (query?.limit ?? 20) + 1;

    const rows = await this.prisma.listing.findMany({
      where: {
        sellerId: ownerId,
        businessId: null,
        deletedAt: null,
      },
      take,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...(query?.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor.id },
          }
        : {}),
      include: CARD_INCLUDE,
    });

    const hasMore = rows.length === take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];

    const result: {
      items: ListingCard[];
      nextCursor?: TimestampCursor;
    } = {
      items: await this.toCards(items),
    };

    if (hasMore && last) {
      result.nextCursor = {
        timestamp: last.updatedAt.toISOString(),
        id: last.id,
      };
    }

    return result;
  }

  /** Maps a page of rows to cards, reading exchange rates at most once. */
  private async toCards(rows: CardRow[]): Promise<ListingCard[]> {
    const needsRates = rows.some((r) => r.priceCurrency !== "TMT");
    const rates = needsRates ? await this.exchangeRates.listAll() : [];
    const toTmt = new Map<string, number>(
      rates.filter((r) => r.toCurrency === "TMT").map((r) => [r.fromCurrency, r.rate]),
    );

    return rows.map((row) => this.toCard(row, toTmt));
  }

  private toCard(row: CardRow, toTmt: Map<string, number>): ListingCard {
    const card: ListingCard = {
      id: row.id,
      sellerId: row.sellerId,
      status: row.status as "active" | "sold" | "archived" | "banned",
      brandId: row.brandId,
      modelId: row.modelId,
      priceAmount: row.priceAmount,
      priceCurrency: row.priceCurrency as Currency,
      displayPriceTmt: this.computeDisplayPriceTmt(
        row.priceAmount,
        row.priceCurrency as Currency,
        toTmt,
      ),
      cityId: row.cityId,
      publishedAt: row.publishedAt ?? new Date(),
      allowCalls: row.allowCalls,
      allowChat: row.allowChat,
      hasVin: !!row.vin,
      acceptsExchange: row.acceptsExchange,
      installmentAvailable: row.installmentAvailable,
      ...toCardPhotos(row.media),
    };

    if (row.year !== null) card.year = row.year;
    if (row.mileageKm !== null) card.mileageKm = row.mileageKm;
    if (row.condition !== null) card.condition = row.condition as "new" | "used";
    if (row.transmissionId !== null) card.transmissionId = row.transmissionId;
    if (row.engineTypeId !== null) card.engineTypeId = row.engineTypeId;
    if (row.contactPhone !== null) card.contactPhone = row.contactPhone;
    if (row.enginePower !== null) card.enginePower = row.enginePower;
    if (row.driveTypeId !== null) card.driveTypeId = row.driveTypeId;
    if (row.bodyTypeId !== null) card.bodyTypeId = row.bodyTypeId;
    if (row.colorId !== null) card.colorId = row.colorId;

    return card;
  }

  private computeDisplayPriceTmt(
    priceAmount: number,
    priceCurrency: Currency,
    toTmt: Map<string, number>,
  ): number {
    if (priceCurrency === "TMT") return priceAmount;
    const rate = toTmt.get(priceCurrency);
    if (rate === undefined || rate <= 0) {
      throw new Error(`Missing exchange rate ${priceCurrency} -> TMT`);
    }
    return priceAmount * rate;
  }
}

/**
 * Narrows a card to the cross-context `ListingSummary` fields so card-only
 * data (notably `contactPhone`) never reaches other contexts at runtime.
 */
function toListingSummary(card: ListingCard): ListingSummary {
  const summary: ListingSummary = {
    id: card.id,
    sellerId: card.sellerId,
    status: card.status,
    brandId: card.brandId,
    modelId: card.modelId,
    priceAmount: card.priceAmount,
    priceCurrency: card.priceCurrency,
    displayPriceTmt: card.displayPriceTmt,
    cityId: card.cityId,
    publishedAt: card.publishedAt,
    allowChat: card.allowChat,
  };
  if (card.year !== undefined) summary.year = card.year;
  if (card.coverMediaKey !== undefined) summary.coverMediaKey = card.coverMediaKey;
  return summary;
}
