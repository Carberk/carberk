import type { InventoryActor } from "./ListingRepository";
import type { ListingMedia } from "../ListingMedia";

/** The reservation an adopting row finalizes, and any poster upload it references. */
export interface ListingMediaClaim {
  token: string;
  actor?: InventoryActor;
  posterUploadId?: string;
}

export interface ListingMediaRepository {
  /**
   * Persists the row. When `media.uploadId` is set, `claim` is required and the
   * row commits together with the adoption of its reserved upload: an upload
   * another target holds fails with `UPLOAD_ALREADY_ATTACHED`, a retired one
   * with `UPLOAD_NOT_AVAILABLE`, and a joined retry returns the committed row.
   */
  save(media: ListingMedia, claim?: ListingMediaClaim): Promise<ListingMedia>;
  findById(id: string): Promise<ListingMedia | null>;
  findByListingId(listingId: string): Promise<ListingMedia[]>;
  delete(id: string): Promise<void>;
  /**
   * Atomically deletes the row and retires the upload it adopted (ADR-0088):
   * the upload can never be adopted again and its deletion work is recorded in
   * the same transaction. `removed` is false when another caller already
   * deleted the row. When supplied, minimumPhotos is checked under a Listing
   * lock before deletion, so concurrent removals cannot cross the floor; that
   * lock is taken before the upload's. A row without provenance retires
   * nothing. No caller deletes storage; the cleanup worker owns that.
   */
  deleteReleasingUpload(id: string, minimumPhotos?: number, actor?: InventoryActor): Promise<{ removed: boolean }>;
  updateSortOrder(
    listingId: string,
    orders: { mediaId: string; sortOrder: number }[],
    actor?: InventoryActor,
  ): Promise<void>;
}

export const LISTING_MEDIA_REPOSITORY = Symbol("ListingMediaRepository");
