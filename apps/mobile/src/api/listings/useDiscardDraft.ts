import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useDiscardDraft(businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);

  return useMutation({
    // Offline, fail now instead of pausing: the Sell wizard's ✕ awaits this delete
    // and must still close.
    networkMode: "always",
    mutationFn: (draftId: string) =>
      businessId ? apiClient.delete(`/listings/drafts/${draftId}`, undefined, requestOptions) : apiClient.delete(`/listings/drafts/${draftId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDrafts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDraftsInfinite() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myCountsAll() });
    },
  });
}
