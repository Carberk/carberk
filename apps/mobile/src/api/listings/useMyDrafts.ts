import { useQuery } from "@tanstack/react-query";
import { ListingsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useMyDrafts(opts?: {
  cursor?: string;
  limit?: number;
  enabled?: boolean;
  businessId?: string | undefined;
}) {
  const cursor = opts?.cursor;
  const limit = opts?.limit ?? 20;
  const enabled = opts?.enabled ?? true;

  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));

  return useQuery({
    queryKey: [...queryKeys.listings.myDrafts(), { cursor, limit, businessId: opts?.businessId }],
    queryFn: async () => opts?.businessId ? { items: (await apiClient.get(`/businesses/${opts.businessId}/inventory`, ListingsSchemas.BusinessInventoryResponseSchema)).drafts, nextCursor: null } :
      apiClient.get(
        `/me/drafts?${params.toString()}`,
        ListingsSchemas.MyDraftsResponseSchema,
      ),
    enabled,
  });
}
