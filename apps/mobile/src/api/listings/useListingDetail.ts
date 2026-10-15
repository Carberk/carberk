import { useQuery } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

/**
 * The Listing detail read: one key and one request, shared by the detail
 * screen and by a Results card's Call, which fetches the contact phone on
 * tap and so warms the screen the buyer may open next.
 */
export function listingDetailQueryOptions(id: string, businessId?: string) {
  return {
    queryKey: businessId ? [...queryKeys.listings.detail(id), "business", businessId] : queryKeys.listings.detail(id),
    queryFn: () =>
      apiClient.get(`/listings/${id}`, ListingsSchemas.ListingDetailSchema, ...(businessId ? [{ headers: { "x-business-id": businessId } }] : [])),
  };
}

export function useListingDetail(id: string, options?: { enabled?: boolean; businessId?: string | undefined }) {
  return useQuery({
    ...listingDetailQueryOptions(id, options?.businessId),
    enabled: !!id && (options?.enabled ?? true),
  });
}
