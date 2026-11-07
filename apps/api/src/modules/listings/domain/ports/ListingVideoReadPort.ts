import type { ListingsSchemas } from "@auto-tm/contracts";
import type { VideoUploadTarget } from "../VideoUpload";

export interface ListingVideoProjection {
  video?: ListingsSchemas.ReadyListingVideo;
  pendingVideo?: ListingsSchemas.PendingListingVideo;
}

export interface ListingVideoReadPort {
  /** Null for a missing/foreign/ineligible target; an owned empty slot is {}. */
  getForTarget(target: VideoUploadTarget, ownerId: string): Promise<ListingVideoProjection | null>;
  /** One authoritative page read; pending state is returned only for this owner. */
  getForListings(listingIds: string[], ownerId?: string, viewerId?: string): Promise<Map<string, ListingVideoProjection>>;
}
export const LISTING_VIDEO_READ_PORT = Symbol("ListingVideoReadPort");
