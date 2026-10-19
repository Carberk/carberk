import type { ListingsSchemas } from "@auto-tm/contracts";

/** What the public feed adds to a summary for the Results card (issue 695). */
export interface FeedCardFields {
  /** Up to eight photo keys in the seller's order; absent from an older API. */
  galleryKeys?: string[];
  allowCalls?: boolean;
  allowChat?: boolean;
  /** Enough to name the seller; never a phone. */
  seller?: { displayName: string | null; nameNumber: number; deleted?: boolean };
}

/**
 * Reads the feed-only fields of a Listing summary. They are optional on the
 * wire, and the contract is moving them from `ListingSummary` to a feed-only
 * summary type, so the card reads them here and nowhere else.
 */
export function feedCardFields(listing: ListingsSchemas.ListingSummary): FeedCardFields {
  return listing as ListingsSchemas.ListingSummary & FeedCardFields;
}

/** The photos the Results strip shows: the gallery when the API sent one, else the two list photos, else the cover. */
export function feedCardPhotoKeys(listing: ListingsSchemas.ListingSummary): string[] {
  const gallery = feedCardFields(listing).galleryKeys;
  if (gallery?.length) return gallery;
  if (listing.photoKeys.length) return listing.photoKeys;
  return listing.coverMediaKey ? [listing.coverMediaKey] : [];
}
