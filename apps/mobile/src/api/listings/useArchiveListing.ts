import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

const ArchiveResponseSchema = z.object({
  id: z.string().guid(),
  status: z.string(),
});

export function useArchiveListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: queryKeys.listings.lifecycleMutation(),
    mutationFn: (listingId: string) =>
      apiClient.post(
        `/listings/${listingId}/archive`,
        {},
        ArchiveResponseSchema,
      ),
    onSuccess: (_data, listingId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.listings.detail(listingId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myListings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myListingsInfinite() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all() });
    },
  });
}
