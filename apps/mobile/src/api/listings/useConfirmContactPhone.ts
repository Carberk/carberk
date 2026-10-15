import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { useInventoryRequestOptions } from "../../business/useInventoryRequestOptions";
import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

/** Confirms a contact phone with its code; a confirmation restarts the 7 days. */
export function useConfirmContactPhone(businessId?: string) {
  const queryClient = useQueryClient();
  const requestOptions = useInventoryRequestOptions(businessId);
  return useMutation({
    mutationFn: (input: ListingsSchemas.ContactPhoneVerifyRequest) =>
      apiClient.post(
        "/me/contact-phones/verify",
        input,
        ListingsSchemas.ContactPhoneVerifyResponseSchema,
        ...(businessId ? [requestOptions] : []),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.listings.myContactPhonesAll(),
      });
    },
  });
}
