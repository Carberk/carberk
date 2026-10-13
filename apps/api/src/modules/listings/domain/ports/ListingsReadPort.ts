import type { ListingStatus } from "../ListingStatus";
import type { TimestampCursor } from "../types";

export interface ListingSummary {
  id: string;
  sellerId: string;
  status: ListingStatus;
  brandId: string;
  modelId: string;
  year?: number;
  priceAmount: number;
  priceCurrency: "TMT" | "USD" | "AED";
  displayPriceTmt: number;
  coverMediaKey?: string;
  /** Server-computed ThumbHash of the cover photo (#824), from `getListingSummary`; absent for a video cover or an unhashed photo. */
  coverThumbHash?: string;
  cityId: string;
  publishedAt: Date;
  allowChat: boolean;
}

export interface AdminListingSummary {
  id: string;
  sellerId: string;
  status: string;
  year: number | null;
  brandName: string;
  modelName: string;
}

export interface ListingsReadPort {
  getListingSummary(id: string): Promise<ListingSummary | null>;
  getListingSummaries(ids: string[]): Promise<ListingSummary[]>;
  getListingAdminSummaries(ids: string[]): Promise<AdminListingSummary[]>;
  getListingsForOwner(
    ownerId: string,
    query?: { cursor?: TimestampCursor; limit?: number },
  ): Promise<{ items: ListingSummary[]; nextCursor?: TimestampCursor }>;
}

export const LISTINGS_READ_PORT = Symbol("ListingsReadPort");
