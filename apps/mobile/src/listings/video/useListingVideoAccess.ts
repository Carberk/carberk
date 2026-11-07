import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthSchemas } from "@auto-tm/contracts";

import { apiClient } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { useAuth } from "../../auth/useAuth";
import { peekAuthSession } from "../../auth/sessionSnapshot";

/** Refresh before each new pick/Use video; cached eligibility never grants an action. */
export function useListingVideoAccess(enabled: boolean) {
  const { isAuthenticated, userId } = useAuth();
  const client = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => apiClient.get("/me", AuthSchemas.MeResponseSchema),
    enabled: enabled && isAuthenticated === true,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const current = isAuthenticated === true && me.data?.id === userId ? me.data : undefined;

  return {
    isVideoUploadTester: current?.isVideoUploadTester === true,
    canUploadVideo: current?.canUploadVideo === true,
    async refresh() {
      if (isAuthenticated !== true || !userId) return false;
      const fresh = await apiClient.get("/me", AuthSchemas.MeResponseSchema);
      if (peekAuthSession()?.user.id !== userId || fresh.id !== userId) return false;
      client.setQueryData(queryKeys.me(), fresh);
      return fresh.canUploadVideo === true;
    },
  };
}
