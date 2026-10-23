import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";
import { measurementHost,emitMeasurement } from "../../measurement/nativeMeasurement";

export function useCreateDraft(businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);

  return useMutation({
    mutationFn: async (payload?: ListingsSchemas.ListingDraftPayload) => {
      const visit=measurementHost.currentVisit();
      const draft=await apiClient.post("/listings/drafts",payload?{initialPayload:payload}:{},ListingsSchemas.ListingDraftSchema,...(businessId?[requestOptions]:[]));
      if(visit && measurementHost.currentVisit()===visit)emitMeasurement({eventName:"draft_started",purpose:"product_improvement",payload:{draftId:draft.id}});
      return draft;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDrafts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myDraftsInfinite() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.myCountsAll() });
    },
  });
}
