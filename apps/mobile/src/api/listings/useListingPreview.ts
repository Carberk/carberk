import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { findCachedListingSummary, type CachedListingSummary } from "./findCachedListingSummary";

/**
 * What Listing detail can show before its own request returns: the card the
 * buyer tapped, read from the feed, Results, Favorites or My listings cache.
 *
 * This is a separate value, not `initialData` or `placeholderData` on the
 * detail query. A summary lacks the detail-only fields (contact, description,
 * seller), so writing it into the detail cache would let a half-filled Listing
 * pass for a loaded one, and the contact bar would trust it. Resolved once per
 * Listing: a deep link finds nothing and shows a plain skeleton.
 */
export function useListingPreview(
  listingId: string,
): CachedListingSummary | undefined {
  const queryClient = useQueryClient();
  return useMemo(
    () => (listingId ? findCachedListingSummary(queryClient, listingId) : undefined),
    [queryClient, listingId],
  );
}
