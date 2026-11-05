import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DateTimeSchema } from "@auto-tm/contracts";
import { z } from "zod";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

const PublishDraftResponseSchema = z.object({
  id: z.string().guid(),
  sellerId: z.string().guid(),
  status: z.string(),
  brandId: z.string().guid(),
  modelId: z.string().guid(),
  priceAmount: z.number(),
  priceCurrency: z.string(),
  publishedAt: DateTimeSchema,
});

export function usePublishDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    // Offline, fail now instead of pausing: a paused publish never settles, and
    // Check and publish would read "Publishing..." until the network came back.
    networkMode: "always",
    mutationFn: (draftId: string) =>
      apiClient.post(
        `/listings/drafts/${draftId}/publish`,
        {},
        PublishDraftResponseSchema,
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
