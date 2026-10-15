import { Optional , Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ListingOwnership } from "./ListingOwnership";
import { BUSINESS_INVENTORY_REPOSITORY, type BusinessInventoryRepository } from "../domain/ports/BusinessInventoryRepository";
import { UploadsSchemas } from "@auto-tm/contracts";


import type { ListingsSchemas } from "@auto-tm/contracts";
import type { z } from "zod";

import type { Currency } from "../domain/types";
import {
  LISTING_REPOSITORY,
  type ListingRepository,
} from "../domain/ports/ListingRepository";
import {
  LISTING_MEDIA_REPOSITORY,
  type ListingMediaRepository,
} from "../domain/ports/ListingMediaRepository";
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
  VIN_DECODER_PORT,
  type VinDecoderPort,
} from "../domain/ports/VinDecoderPort";
import {
  SELLER_PROFILE_PORT,
  type SellerProfilePort,
} from "../domain/ports/SellerProfilePort";

import { LISTING_VIEWS_PORT, type ListingViewsPort } from "../domain/ports/ListingViewsPort";
import { IDENTITY_CLOCK_PORT, type ClockPort } from "../../identity/identity.public";

export interface GetListingDetailInput {
  listingId: string;
  requestingUserId?: string | undefined;
  sessionId?: string | undefined;
  businessId?: string | undefined;
}

export type ListingDetailDto = z.infer<typeof ListingsSchemas.ListingDetailSchema>;

@Injectable()
export class GetListingDetail {
  constructor(
    @Inject(LISTING_REPOSITORY)
    private readonly listings: ListingRepository,
    @Inject(LISTING_MEDIA_REPOSITORY)
    private readonly mediaRepo: ListingMediaRepository,
    @Inject(EXCHANGE_RATE_PORT)
    private readonly exchangeRates: ExchangeRatePort,
    @Inject(MEDIA_STORAGE_PORT)
    private readonly storage: MediaStoragePort,
    @Inject(FAVORITE_REPOSITORY)
    private readonly favorites: FavoriteRepository,
    @Inject(VIN_DECODER_PORT)
    private readonly vinDecoder: VinDecoderPort,
    @Inject(SELLER_PROFILE_PORT)
    private readonly sellerProfiles: SellerProfilePort,
    @Inject(LISTING_VIEWS_PORT) private readonly views: ListingViewsPort,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort,
    @Optional() @Inject(BUSINESS_INVENTORY_REPOSITORY) private readonly inventory?: BusinessInventoryRepository,
    @Optional() @Inject(ListingOwnership) private readonly ownership?: ListingOwnership,
  ) {}

  async execute(input: GetListingDetailInput): Promise<ListingDetailDto> {
    const listing = await this.listings.findById(input.listingId);

    if (!listing || listing.deletedAt) {
      throw new NotFoundException("Listing not found");
    }

    let currentMember = false;
    const business = listing.businessId ? await this.inventory?.publicBusiness(listing.businessId) : null;
    if (listing.businessId && input.requestingUserId && input.businessId === listing.businessId && this.ownership) {
      try { await this.ownership.authorize({ userId: input.requestingUserId, sessionId: input.sessionId, businessId: input.businessId }, listing, undefined, true); currentMember = true; } catch { /* Public reads retain their ordinary audience. */ }
    }
    if (listing.businessId && (!business || business.status !== "active") && !currentMember) throw new NotFoundException("Listing not found");
    if (listing.status === "banned" && !(listing.businessId ? currentMember : input.requestingUserId === listing.sellerId)) throw new NotFoundException("Listing not found");
    const seller = business ? { displayName: business.name, nameNumber: 1000, avatarIndex: 0, avatarKey: null, deleted: false, memberSince: business.createdAt } : await this.sellerProfiles.getSellerProfile(listing.sellerId);
    if (!seller) throw new NotFoundException("Seller not found");

    const media = await this.mediaRepo.findByListingId(input.listingId);
    const displayPriceTmt = await this.computeDisplayPriceTmt(
      listing.priceAmount,
      listing.priceCurrency,
    );
    const isFavorited = input.requestingUserId
      ? await this.favorites.exists(input.requestingUserId, listing.id)
      : false;
    const vinHistory = listing.vin
      ? await this.vinDecoder.decode(listing.vin)
      : undefined;

    return {
      id: listing.id,
      publicNumber: listing.publicNumber,
      sellerId: listing.sellerId,
      ...(listing.businessId ? { businessId: listing.businessId } : {}),
      seller: {
        displayName: seller.displayName,
        nameNumber: seller.nameNumber,
        avatarIndex: seller.avatarIndex,
        avatarKey: seller.avatarKey,
        deleted: seller.deleted,
        memberSince: seller.memberSince.toISOString(),
      },
      status: listing.status,
      brandId: listing.brandId,
      modelId: listing.modelId,
      generationId: listing.generationId,
      year: listing.year,
      vin: listing.vin,
      condition: listing.condition,
      mileageKm: listing.mileageKm,
      colorId: listing.colorId,
      bodyTypeId: listing.bodyTypeId,
      transmissionId: listing.transmissionId,
      driveTypeId: listing.driveTypeId,
      engineTypeId: listing.engineTypeId,
      enginePower: listing.enginePower,
      priceAmount: listing.priceAmount,
      priceCurrency: listing.priceCurrency,
      displayPriceTmt,
      description: listing.description,
      regionId: listing.regionId || "",
      cityId: listing.cityId,
      locationText: listing.locationText,
      contactPhone: listing.contactPhone,
      allowCalls: listing.allowCalls,
      allowChat: listing.allowChat,
      acceptsExchange: listing.acceptsExchange,
      installmentAvailable: listing.installmentAvailable,
      media: media.map((m) => ({
        id: m.id,
        kind: m.kind,
        key: m.key,
        variants: buildVariants(m.key, this.storage.resolvePublicUrl.bind(this.storage)),
        width: m.width,
        height: m.height,
        sortOrder: m.sortOrder,
        durationMs: m.durationMs,
        posterKey: m.posterKey,
        ...(m.thumbHash !== undefined ? { thumbHash: m.thumbHash } : {}),
      })),
      ...((listing.status === "active" || currentMember || (!listing.businessId && input.requestingUserId === listing.sellerId))
        ? await this.views.counts(listing.id, this.clock.now()) : { viewCount: 0 }),
      favoriteCount: listing.favoriteCount,
      isFavorited,
      conditionDisclosure: listing.conditionDisclosure,
      vinHistory,
      publishedAt: listing.publishedAt.toISOString(),
      soldAt: listing.soldAt?.toISOString(),
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    };
  }

  private async computeDisplayPriceTmt(
    priceAmount: number,
    priceCurrency: Currency,
  ): Promise<number> {
    if (priceCurrency === "TMT") return priceAmount;
    const rate = await this.exchangeRates.getRate(priceCurrency, "TMT");
    if (rate <= 0) {
      throw new Error(`Missing exchange rate ${priceCurrency} -> TMT`);
    }
    return priceAmount * rate;
  }
}

function buildVariants(
  key: string,
  resolveUrl: (k: string) => string,
): { thumbnail: string; list: string; detail: string; fullscreen: string } {
  if (key.endsWith(".mp4") || key.endsWith(".mov")) {
    const url = resolveUrl(key);
    return { thumbnail: url, list: url, detail: url, fullscreen: url };
  }

  const base = key.replace(/\/original\.(jpg|webp|jpeg)$/, "");
  return {
    thumbnail: `${resolveUrl(`${base}/thumbnail.webp`)}?v=${UploadsSchemas.PHOTO_VARIANT_CACHE_VERSION}`,
    list: `${resolveUrl(`${base}/list.webp`)}?v=${UploadsSchemas.PHOTO_VARIANT_CACHE_VERSION}`,
    detail: `${resolveUrl(`${base}/detail.webp`)}?v=${UploadsSchemas.PHOTO_VARIANT_CACHE_VERSION}`,
    fullscreen: `${resolveUrl(`${base}/fullscreen.webp`)}?v=${UploadsSchemas.PHOTO_VARIANT_CACHE_VERSION}`,
  };
}
