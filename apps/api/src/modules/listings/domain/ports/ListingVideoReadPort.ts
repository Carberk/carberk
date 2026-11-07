import type { ListingsSchemas } from "@auto-tm/contracts";

export interface ListingVideoProjection {
  video?: ListingsSchemas.ReadyListingVideo;
  pendingVideo?: ListingsSchemas.PendingListingVideo;
}

export interface ListingVideoReadPort {
  /** One authoritative page read; pending state is returned only for this owner. */
  getForListings(listingIds: string[], ownerId?: string, viewerId?: string): Promise<Map<string, ListingVideoProjection>>;
}
export const LISTING_VIDEO_READ_PORT = Symbol("ListingVideoReadPort");
