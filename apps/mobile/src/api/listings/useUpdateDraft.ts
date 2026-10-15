import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useUpdateDraft(businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);

  return useMutation({
    // Offline, fail now instead of pausing: a paused save never settles, and the
    // Sell wizard's ✕ awaits it. `useWizardAutosave` retries on reconnect itself.
    networkMode: "always",
    mutationFn: ({
      draftId,
      payload,
    }: {
      draftId: string;
      payload: ListingsSchemas.ListingDraftPayload;
    }) =>
      apiClient.patch(
        `/listings/drafts/${draftId}`,
        payload,
        ListingsSchemas.ListingDraftSchema,
        ...(businessId ? [requestOptions] : []),
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDrafts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDraftsInfinite() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.listings.detail(variables.draftId),
      });
    },
  });
}
