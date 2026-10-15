import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useEditListing(businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);

  return useMutation({
    mutationFn: ({
      listingId,
      patch,
    }: {
      listingId: string;
      patch: ListingsSchemas.EditListingRequest;
    }) =>
      apiClient.patch(
        `/listings/${listingId}`,
        patch,
        ListingsSchemas.ListingDetailSchema,
        ...(businessId ? [requestOptions] : []),
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.listings.detail(variables.listingId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myListings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myListingsInfinite() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all() });
    },
  });
}
