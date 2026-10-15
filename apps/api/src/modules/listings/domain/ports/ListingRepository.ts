export interface InventoryActor { userId: string; sessionId?: string | undefined; businessId?: string | undefined }
import type { Listing } from "../Listing";

export interface ListingRepository {
  save(listing: Listing): Promise<Listing>;
  findById(id: string): Promise<Listing | null>;
  findBySellerId(
    sellerId: string,
    opts?: { cursor?: { timestamp: string; id: string }; limit?: number },
  ): Promise<{ items: Listing[]; nextCursor?: { timestamp: string; id: string } }>;
  /** `priceTmt`, when given, is written in the same statement as the Listing. */
  update(listing: Listing, derived?: { priceTmt: number }, actor?: InventoryActor): Promise<Listing>;
  softDelete(id: string, at: Date, actor?: InventoryActor): Promise<void>;
  /** Rewrites every Listing's `priceTmt` from the stored rates; returns rows changed. */
  recomputePriceTmt(): Promise<number>;
}

export const LISTING_REPOSITORY = Symbol("ListingRepository");
