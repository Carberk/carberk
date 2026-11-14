import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useAttachMedia(listingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (input: ListingsSchemas.AttachMediaRequest) =>
      apiClient.post(
        `/listings/${listingId}/media/attach`,
        input,
        ListingsSchemas.AttachMediaResponseSchema,
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
