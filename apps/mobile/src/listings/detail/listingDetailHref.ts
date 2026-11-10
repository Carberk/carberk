/** What a card asks Listing detail to show first: the video cover a buyer tapped (#1051). */
export type ListingOpenTarget = { video: true };

/** The route parameter detail reads to land on the video; any other value lands on the cover photo. */
export const DETAIL_MEDIA_VIDEO = "video";

/** Listing detail, opened on the video when the card's video cover was tapped. */
export function listingDetailHref(id: string, open?: ListingOpenTarget) {
  return open?.video ? (`/(public)/listings/${id}?media=${DETAIL_MEDIA_VIDEO}` as const) : (`/(public)/listings/${id}` as const);
}
