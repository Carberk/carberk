import type { CardPhotos } from "../CardPhotos";
import type { TimestampCursor } from "../types";
import type { ListingSummary } from "./ListingsReadPort";

/**
 * In-context card read model: a `ListingSummary` plus the fields the
 * Home, Favorites, and My Listings cards render without a detail fetch.
 * Consumed only inside `listings/`; the cross-context `ListingsReadPort`
 * surface is unchanged.
 */
export interface ListingCard extends ListingSummary, CardPhotos {
  mileageKm?: number;
  condition?: "new" | "used";
  transmissionId?: string;
  engineTypeId?: string;
  contactPhone?: string;
  allowCalls: boolean;
  /** What Listing detail's preview places before detail loads (#867). */
  enginePower?: number;
  driveTypeId?: string;
  bodyTypeId?: string;
  colorId?: string;
  /** Whether the Listing has a VIN; the VIN itself stays on detail. */
  hasVin?: boolean;
  acceptsExchange?: boolean;
  installmentAvailable?: boolean;
}

export interface ListingCardReadPort {
  /**
   * Card photo fields for the given Listing ids in one batched read. Ids with
   * no media are absent from the map. Used by `ListFeed` next to
   * `FeedRankingPort.rank()`, which stays ranking-only per ADR-0021.
   */
  getCardPhotos(listingIds: string[]): Promise<Map<string, CardPhotos>>;
  /** Cards for the given ids, excluding deleted, banned, and non-public-status Listings. Order is not preserved. */
  getVisibleCards(ids: string[]): Promise<ListingCard[]>;
  /** The owner's non-deleted Listings (any status), newest `updatedAt` first. */
  getOwnerCards(
    ownerId: string,
    query?: { cursor?: TimestampCursor; limit?: number },
  ): Promise<{ items: ListingCard[]; nextCursor?: TimestampCursor }>;
}

export const LISTING_CARD_READ_PORT = Symbol("ListingCardReadPort");
