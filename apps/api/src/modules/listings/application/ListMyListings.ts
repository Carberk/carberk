import { Inject, Injectable } from "@nestjs/common";

import { ListingsSchemas } from "@auto-tm/contracts";
import type { z } from "zod";

import {
  LISTING_CARD_READ_PORT,
  type ListingCardReadPort,
} from "../domain/ports/ListingCardReadPort";

import { cardPreviewFields } from "../domain/CardPreviewFields";

import { decodeListingsCursor } from "./decodeListingsCursor";

export interface ListMyListingsInput {
  userId: string;
  cursor?: string;
  limit?: number;
}

export type MyListingsResponseDto = z.infer<typeof ListingsSchemas.MyListingsResponseSchema>;

@Injectable()
export class ListMyListings {
  constructor(
    @Inject(LISTING_CARD_READ_PORT)
    private readonly cards: ListingCardReadPort,
  ) {}

  async execute(input: ListMyListingsInput): Promise<MyListingsResponseDto> {
    const limit = Math.min(input.limit ?? 20, 50);

    const decodedCursor = input.cursor
      ? decodeListingsCursor(input.cursor)
      : undefined;

    const result = await this.cards.getOwnerCards(input.userId, {
      ...(decodedCursor !== undefined ? { cursor: decodedCursor } : {}),
      limit,
    });

    return {
      items: result.items.map((item) => ({
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
        photoCount: item.photoCount,
        mileageKm: item.mileageKm,
        condition: item.condition,
        transmissionId: item.transmissionId,
        engineTypeId: item.engineTypeId,
        cityId: item.cityId,
        publishedAt: item.publishedAt.toISOString(),
        ...cardPreviewFields(item),
      })),
      nextCursor: result.nextCursor
        ? ListingsSchemas.encodeCursor(result.nextCursor)
        : null,
    };
  }
}
