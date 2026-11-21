import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useReorderMedia(listingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (input: ListingsSchemas.ReorderMediaRequest) =>
      apiClient.put(
        `/listings/${listingId}/media/order`,
        input,
        ListingsSchemas.ReorderMediaResponseSchema,
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
