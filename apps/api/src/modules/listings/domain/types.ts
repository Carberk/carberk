export type Currency = "TMT" | "USD" | "AED";

/** The seller's statement about the car's condition (ADR-0052). */
export interface ConditionDisclosure {
  damaged: boolean;
  knownIssuesText?: string | undefined;
}

export type MediaKind = "image" | "video";

/** Keyset position for owner-scoped lists (drafts, My listings, Favorites). */
export type TimestampCursor = {
  timestamp: string;
  id: string;
};

/** Public-feed orders. `newest` is the default. */
export const FEED_SORTS = [
  "newest",
  "price_asc",
  "price_desc",
  "year_desc",
  "year_asc",
  "mileage_asc",
] as const;
export type FeedSort = (typeof FEED_SORTS)[number];
export const DEFAULT_FEED_SORT: FeedSort = "newest";

/**
 * Keyset position in one feed order: the last Listing's sort-key value and id.
 * `value` is null once paging has reached Listings without that key (no price in
 * TMT, year or mileage), which always sort last. A cursor is valid only for the
 * order it names.
 */
export type FeedCursor =
  | { sort: "newest"; value: string; id: string }
  | { sort: Exclude<FeedSort, "newest">; value: number | null; id: string };

/** Filter-matching total plus the price range in TMT; both prices null when total is 0. */
export interface FeedCountSummary {
  totalMatching: number;
  priceMinTmt: number | null;
  priceMaxTmt: number | null;
}

export interface ListingFilterCriteria {
  // Forward-defined for S5 / #92 — S4 always passes empty filters
  brandId?: string;
  modelId?: string;
  modelIds?: string[];
  cityId?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  condition?: "new" | "used";
}

export const LOCKED_FIELDS = [
  "brandId",
  "modelId",
  "generationId",
  "year",
  "vin",
] as const;
export type LockedField = (typeof LOCKED_FIELDS)[number];

export const LISTING_ERROR_CODES = {
  CONTACT_METHOD_REQUIRED: "CONTACT_METHOD_REQUIRED",
  DAMAGED_REQUIRED: "DAMAGED_REQUIRED",
  LISTING_FIELD_LOCKED: "LISTING_FIELD_LOCKED",
  EXCHANGE_RATE_MISSING: "EXCHANGE_RATE_MISSING",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  INVALID_PRICE: "INVALID_PRICE",
  INVALID_FILTER_RANGE: "INVALID_FILTER_RANGE",
  INVALID_FEED_CURSOR: "INVALID_FEED_CURSOR",
  INVALID_EXCHANGE_RATE: "INVALID_EXCHANGE_RATE",
  MEDIA_LIMIT_EXCEEDED: "MEDIA_LIMIT_EXCEEDED",
  UPLOAD_NOT_AVAILABLE: "UPLOAD_NOT_AVAILABLE",
  UPLOAD_ALREADY_ATTACHED: "UPLOAD_ALREADY_ATTACHED",
  UPLOAD_OBJECT_INVALID: "UPLOAD_OBJECT_INVALID",
} as const;
export type ListingErrorCode =
  (typeof LISTING_ERROR_CODES)[keyof typeof LISTING_ERROR_CODES];

export class DomainError extends Error {
  constructor(
    readonly code: ListingErrorCode,
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = "DomainError";
  }
}
