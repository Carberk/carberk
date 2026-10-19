import { useQuery } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

/**
 * The Listing detail read: one key and one request, shared by the detail
 * screen and by a Results card's Call, which fetches the contact phone on
 * tap and so warms the screen the buyer may open next.
 */
export function listingDetailQueryOptions(id: string) {
  return {
    queryKey: queryKeys.listings.detail(id),
    queryFn: () =>
      apiClient.get(`/listings/${id}`, ListingsSchemas.ListingDetailSchema),
  };
}

export function useListingDetail(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    ...listingDetailQueryOptions(id),
    enabled: !!id && (options?.enabled ?? true),
  });
}
