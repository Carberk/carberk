import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useCreateDraft(businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);

  return useMutation({
    mutationFn: (payload?: ListingsSchemas.ListingDraftPayload) =>
      apiClient.post(
        "/listings/drafts",
        payload ? { initialPayload: payload } : {},
        ListingsSchemas.ListingDraftSchema,
        ...(businessId ? [requestOptions] : []),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDrafts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDraftsInfinite() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myCountsAll() });
    },
  });
}
