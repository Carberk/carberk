import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useRemoveMedia(listingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (mediaId: string) =>
      apiClient.delete(
        `/listings/${listingId}/media/${mediaId}`,
        ListingsSchemas.RemoveMediaResponseSchema,
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
