import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useReorderMedia(listingId: string, businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);

  return useMutation({
    mutationFn: (input: ListingsSchemas.ReorderMediaRequest) =>
      apiClient.put(
        `/listings/${listingId}/media/order`,
        input,
        ListingsSchemas.ReorderMediaResponseSchema,
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
