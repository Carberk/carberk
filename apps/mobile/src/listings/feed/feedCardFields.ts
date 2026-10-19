import type { ListingsSchemas } from "@auto-tm/contracts";

/** What the public feed adds to a summary for the Results card (issue 695). */
export interface FeedCardFields {
  /** Up to eight photo keys in the seller's order; absent from an older API. */
  galleryKeys?: string[];
  /** Absent from an older API: the card then offers neither Call nor Message. */
  allowCalls?: boolean;
  allowChat?: boolean;
  /** Enough to name the seller; never a phone. Absent from an older API. */
  seller?: { displayName: string | null; nameNumber: number; deleted?: boolean };
}

/**
 * Reads the feed-only fields of a Listing summary. They are optional on the
 * wire and live on the feed item type only (`FeedListingSummary`), so the card
 * reads them here and nowhere else and accepts any summary.
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
