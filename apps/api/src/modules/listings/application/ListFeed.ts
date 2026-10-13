import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { ListingsSchemas } from "@auto-tm/contracts";
import type { z } from "zod";

import {
  DEFAULT_FEED_SORT,
  LISTING_ERROR_CODES,
  type Currency,
  type FeedCursor,
  type FeedSort,
  type ListingFilterCriteria,
} from "../domain/types";
import {
  FEED_RANKING_PORT,
  type FeedRankingPort,
} from "../domain/ports/FeedRankingPort";
import {
  EXCHANGE_RATE_PORT,
  type ExchangeRatePort,
} from "../domain/ports/ExchangeRatePort";
import {
  MEDIA_STORAGE_PORT,
  type MediaStoragePort,
} from "../domain/ports/MediaStoragePort";
import {
  FAVORITE_REPOSITORY,
  type FavoriteRepository,
} from "../domain/ports/FavoriteRepository";
import {
  LISTING_CARD_READ_PORT,
  type ListingCardReadPort,
} from "../domain/ports/ListingCardReadPort";
import {
  SELLER_PROFILE_PORT,
  type SellerProfilePort,
} from "../domain/ports/SellerProfilePort";
import { toCardPhotos } from "../domain/CardPhotos";
import { cardPreviewFields } from "../domain/CardPreviewFields";

export interface ListFeedInput {
  /** Signed-in viewer, when the request carries one; drives `isFavorited`. */
  viewerId?: string;
  /** Defaults to `newest`. */
  sort?: FeedSort;
  cursor?: string;
  limit?: number;
  filters?: ListingFilterCriteria;
}

export type FeedResponseDto = z.infer<typeof ListingsSchemas.FeedResponseSchema>;

@Injectable()
export class ListFeed {
  constructor(
    @Inject(FEED_RANKING_PORT)
    private readonly ranking: FeedRankingPort,
    @Inject(EXCHANGE_RATE_PORT)
    private readonly exchangeRates: ExchangeRatePort,
    @Inject(MEDIA_STORAGE_PORT)
    private readonly storage: MediaStoragePort,
    @Inject(FAVORITE_REPOSITORY)
    private readonly favorites: FavoriteRepository,
    @Inject(LISTING_CARD_READ_PORT)
    private readonly cards: ListingCardReadPort,
    @Inject(SELLER_PROFILE_PORT)
    private readonly sellerProfiles: SellerProfilePort,
  ) {}

  async execute(input: ListFeedInput): Promise<FeedResponseDto> {
    const limit = Math.min(input.limit ?? 20, 50);

    const sort = input.sort ?? DEFAULT_FEED_SORT;
    const decodedCursor =
      input.cursor !== undefined ? decodeCursorFor(sort, input.cursor) : undefined;

    const rankResult = await this.ranking.rank({
      ...(input.viewerId !== undefined ? { viewerId: input.viewerId } : {}),
      sort,
      ...(decodedCursor !== undefined ? { cursor: decodedCursor } : {}),
      limit,
      ...(input.filters !== undefined ? { filters: input.filters } : {}),
    });

    const listingIds = rankResult.items.map((listing) => listing.id);
    const sellerIds = rankResult.items.map((listing) => listing.sellerId);
    const rateMap = await this.buildRateMap();
    // Batched per page, never per Listing: one media read, one seller read,
    // one favorites read.
    const [photosById, sellers, favorited] = await Promise.all([
      this.cards.getCardPhotos(listingIds),
      this.sellerProfiles.getCardSellers(sellerIds),
      input.viewerId !== undefined
        ? this.favorites.favoritedListingIds(input.viewerId, listingIds)
        : undefined,
    ]);
    const noPhotos = toCardPhotos([]);

    const items = rankResult.items.map((listing) => {
      const photos = photosById.get(listing.id) ?? noPhotos;
      const seller = sellers.get(listing.sellerId);
      const displayPriceTmt = this.computeDisplayPriceTmt(
        listing.priceAmount,
        listing.priceCurrency,
        rateMap,
      );

      return {
        id: listing.id,
        sellerId: listing.sellerId,
        status: listing.status,
        brandId: listing.brandId,
        modelId: listing.modelId,
        year: listing.year,
        priceAmount: listing.priceAmount,
        priceCurrency: listing.priceCurrency,
        displayPriceTmt,
        coverMediaKey: listing.coverMediaKey,
        photoKeys: photos.photoKeys,
        ...(photos.photoThumbHashes ? { photoThumbHashes: photos.photoThumbHashes } : {}),
        galleryKeys: photos.galleryKeys,
        ...(photos.galleryThumbHashes ? { galleryThumbHashes: photos.galleryThumbHashes } : {}),
        photoCount: photos.photoCount,
        ...(listing.mileageKm !== undefined ? { mileageKm: listing.mileageKm } : {}),
        ...(listing.condition !== undefined ? { condition: listing.condition } : {}),
        ...(listing.transmissionId !== undefined
          ? { transmissionId: listing.transmissionId }
          : {}),
        ...(listing.engineTypeId !== undefined ? { engineTypeId: listing.engineTypeId } : {}),
        cityId: listing.cityId,
        publishedAt: listing.publishedAt.toISOString(),
        ...(favorited !== undefined ? { isFavorited: favorited.has(listing.id) } : {}),
        // The contact phone stays out: a caller reads it from Listing detail.
        ...cardPreviewFields({
          enginePower: listing.enginePower,
          driveTypeId: listing.driveTypeId,
          bodyTypeId: listing.bodyTypeId,
          colorId: listing.colorId,
          hasVin: !!listing.vin,
          acceptsExchange: listing.acceptsExchange,
          installmentAvailable: listing.installmentAvailable,
        }),
        allowCalls: listing.allowCalls,
        allowChat: listing.allowChat,
        ...(seller !== undefined
          ? {
              seller: {
                displayName: seller.displayName,
                nameNumber: seller.nameNumber,
                deleted: seller.deleted,
              },
            }
          : {}),
      };
    });

    return {
      items,
      nextCursor: rankResult.nextCursor
        ? ListingsSchemas.encodeFeedCursor(rankResult.nextCursor)
        : null,
    };
  }

  private async buildRateMap(): Promise<Map<string, number>> {
    const map = new Map<string, number>([["TMT", 1]]);
    const rates = await this.exchangeRates.listAll();
    for (const r of rates) {
      map.set(`${r.fromCurrency}->${r.toCurrency}`, r.rate);
    }
    return map;
  }

  private computeDisplayPriceTmt(
    priceAmount: number,
    priceCurrency: Currency,
    rateMap: Map<string, number>,
  ): number {
    if (priceCurrency === "TMT") return priceAmount;
    const rate = rateMap.get(`${priceCurrency}->TMT`);
    if (rate === undefined) {
      throw new Error(`Missing exchange rate ${priceCurrency} -> TMT`);
    }
    return priceAmount * rate;
  }
}

/** A malformed cursor, or one issued for another order, is a 400. */
function decodeCursorFor(sort: FeedSort, token: string): FeedCursor {
  let cursor: FeedCursor;
  try {
    cursor = ListingsSchemas.decodeFeedCursor(token);
  } catch {
    throw invalidCursor("Invalid feed cursor");
  }
  if (cursor.sort !== sort) {
    throw invalidCursor(`Cursor for "${cursor.sort}" cannot page "${sort}"`);
  }
  return cursor;
}

function invalidCursor(message: string): BadRequestException {
  return new BadRequestException({
    code: "VALIDATION_ERROR",
    message,
    details: { reason: LISTING_ERROR_CODES.INVALID_FEED_CURSOR },
  });
}
