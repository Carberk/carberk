import { Inject, Injectable } from "@nestjs/common";

import { ListingsSchemas } from "@auto-tm/contracts";
import type { z } from "zod";

import {
  FAVORITE_REPOSITORY,
  type FavoriteRepository,
} from "../domain/ports/FavoriteRepository";
import {
  LISTING_CARD_READ_PORT,
  type ListingCardReadPort,
} from "../domain/ports/ListingCardReadPort";

import { decodeListingsCursor } from "./decodeListingsCursor";

export interface ListMyFavoritesInput {
  userId: string;
  cursor?: string;
  limit?: number;
  /** Only Favorites whose Listing is active. Default false. */
  activeOnly?: boolean;
}

export type MyFavoritesResponseDto = z.infer<
  typeof ListingsSchemas.MyFavoritesResponseSchema
>;

@Injectable()
export class ListMyFavorites {
  constructor(
    @Inject(FAVORITE_REPOSITORY)
    private readonly favorites: FavoriteRepository,
    @Inject(LISTING_CARD_READ_PORT)
    private readonly cards: ListingCardReadPort,
  ) {}

  async execute(input: ListMyFavoritesInput): Promise<MyFavoritesResponseDto> {
    const limit = Math.min(input.limit ?? 20, 50);

    const decodedCursor = input.cursor
      ? decodeListingsCursor(input.cursor)
      : undefined;

    // Paging runs over Favorites whose Listing is visible, so a page is full whenever
    // that many remain; the counts ignore paging and the activeOnly filter.
    const [favoriteResult, counts] = await Promise.all([
      this.favorites.listVisibleByUserId(input.userId, {
        ...(decodedCursor !== undefined ? { cursor: decodedCursor } : {}),
        limit,
        activeOnly: input.activeOnly ?? false,
      }),
      this.favorites.countVisibleByUserId(input.userId),
    ]);

    const listingIds = favoriteResult.items.map((f) => f.listingId);
    const cards = await this.cards.getVisibleCards(listingIds);

    // Build a map for stable ordering and deduplication
    const cardMap = new Map(cards.map((s) => [s.id, s]));

    // Preserve favorite order (newest first). The repository already dropped
    // Listings that are not visible; this guards a status change between the reads.
    const items = favoriteResult.items
      .map((f) => cardMap.get(f.listingId))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);

    return {
      items: items.map((item) => ({
        id: item.id,
        sellerId: item.sellerId,
        status: item.status,
        brandId: item.brandId,
        modelId: item.modelId,
        year: item.year,
        priceAmount: item.priceAmount,
        priceCurrency: item.priceCurrency,
        displayPriceTmt: item.displayPriceTmt,
        coverMediaKey: item.coverMediaKey,
        photoKeys: item.photoKeys,
        ...(item.photoThumbHashes ? { photoThumbHashes: item.photoThumbHashes } : {}),
        galleryKeys: item.galleryKeys,
        ...(item.galleryThumbHashes ? { galleryThumbHashes: item.galleryThumbHashes } : {}),
        photoCount: item.photoCount,
        mileageKm: item.mileageKm,
        condition: item.condition,
        transmissionId: item.transmissionId,
        engineTypeId: item.engineTypeId,
        cityId: item.cityId,
        publishedAt: item.publishedAt.toISOString(),
        contactPhone: item.contactPhone,
        allowCalls: item.allowCalls,
        allowChat: item.allowChat,
      })),
      nextCursor: favoriteResult.nextCursor
        ? ListingsSchemas.encodeCursor(favoriteResult.nextCursor)
        : null,
      counts,
    };
  }
}
