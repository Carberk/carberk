export interface ListingMediaCounts {
  count(listingId: string, kind?: "image"): Promise<number>;
}

export const LISTING_MEDIA_COUNTS = Symbol("ListingMediaCounts");
