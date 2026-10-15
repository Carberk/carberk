import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

const PublishDraftResponseSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  status: z.string(),
  brandId: z.string().uuid(),
  modelId: z.string().uuid(),
  priceAmount: z.number(),
  priceCurrency: z.string(),
  publishedAt: z.string().datetime(),
});

export function usePublishDraft(businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);

  return useMutation({
    // Offline, fail now instead of pausing: a paused publish never settles, and
    // Check and publish would read "Publishing..." until the network came back.
    networkMode: "always",
    mutationFn: (draftId: string) =>
      apiClient.post(
        `/listings/drafts/${draftId}/publish`,
        {},
        PublishDraftResponseSchema,
        ...(businessId ? [requestOptions] : []),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myListings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myListingsInfinite() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDrafts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDraftsInfinite() });
    },
  });
}
