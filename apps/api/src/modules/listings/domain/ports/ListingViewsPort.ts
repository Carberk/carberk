export const LISTING_VIEWS_PORT = Symbol("ListingViewsPort");

export interface ListingViewsPort {
  /** Raw viewer key is transient input only. Persist only a daily salted fingerprint. */
  record(input: { listingId: string; viewerKey: string; requestingUserId?: string; sessionId?: string; now: Date }): Promise<boolean>;
  counts(listingId: string, now: Date): Promise<{ viewCount: number; viewsToday: number }>;
}
