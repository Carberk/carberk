import type { ListingsSchemas } from "@auto-tm/contracts";

/**
 * What the public feed adds to a summary for the Results card (issue 695).
 * Every field is optional on the wire: an older API sends none, and the card
 * then shows the two list photos and neither Call, Message nor the seller.
 */
export type FeedCardFields = Pick<ListingsSchemas.FeedListingSummary, "galleryKeys" | "galleryThumbHashes" | "allowCalls" | "allowChat" | "seller">;

/** Reads the feed-only fields of a feed item; the card reads them here and nowhere else. */
export function feedCardFields(listing: ListingsSchemas.FeedListingSummary): FeedCardFields {
  const { galleryKeys, galleryThumbHashes, allowCalls, allowChat, seller } = listing;
  return { galleryKeys, galleryThumbHashes, allowCalls, allowChat, seller };
}

/** The photos a card's strip shows (Results and Favorites): the gallery when the API sent one, else the two list photos, else the cover. */
export function feedCardPhotoKeys(listing: Pick<ListingsSchemas.FeedListingSummary, "galleryKeys" | "photoKeys" | "coverMediaKey">): string[] {
  const gallery = listing.galleryKeys;
  if (gallery?.length) return gallery;
  if (listing.photoKeys.length) return listing.photoKeys;
  return listing.coverMediaKey ? [listing.coverMediaKey] : [];
}

const NO_THUMB_HASHES: readonly (string | null)[] = [];

/** The ThumbHashes of `feedCardPhotoKeys`, slot for slot; empty when the API sent none for that list. */
export function feedCardPhotoThumbHashes(
  listing: Pick<ListingsSchemas.FeedListingSummary, "galleryKeys" | "galleryThumbHashes" | "photoKeys" | "photoThumbHashes">,
): readonly (string | null)[] {
  if (listing.galleryKeys?.length) return listing.galleryThumbHashes ?? NO_THUMB_HASHES;
  if (listing.photoKeys.length) return listing.photoThumbHashes ?? NO_THUMB_HASHES;
  return NO_THUMB_HASHES;
}
