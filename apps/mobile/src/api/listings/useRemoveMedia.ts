import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useRemoveMedia(listingId: string, businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);

  return useMutation({
    mutationFn: (mediaId: string) =>
      apiClient.delete(
        `/listings/${listingId}/media/${mediaId}`,
        ListingsSchemas.RemoveMediaResponseSchema,
        ...(businessId ? [requestOptions] : []),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.listings.detail(listingId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.listings.myListings(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.listings.myListingsInfinite(),
      });
    },
  });
}
