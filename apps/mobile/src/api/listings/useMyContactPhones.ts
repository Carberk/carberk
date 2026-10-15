import { useQuery } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

/** The seller's reusable confirmed contact phones, without the account phone (ADR-0081). */
export function useMyContactPhones(opts: {
  userId: string | null;
  enabled?: boolean;
  businessId?: string | undefined;
}) {
  return useQuery({
    queryKey: [...queryKeys.listings.myContactPhones(opts.userId), opts.businessId ?? "personal"],
    queryFn: () =>
      apiClient.get(
        "/me/contact-phones",
        ListingsSchemas.MyContactPhonesResponseSchema,
        { headers: opts.businessId ? { "x-business-id": opts.businessId } : {} },
      ),
    enabled: (opts.enabled ?? true) && opts.userId != null,
  });
}
