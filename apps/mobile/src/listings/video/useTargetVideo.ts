import { useQuery, useQueryClient } from "@tanstack/react-query";
import { VideoUploadsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { useAuth } from "../../auth/useAuth";

type Target = VideoUploadsSchemas.VideoUploadTarget;
export function useTargetVideo(target?: Target, enabled = true) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.listings.ownerVideo(userId, target?.type, target?.id);
  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (!target) throw new Error("A video target is required");
      return apiClient.get(`/listings/video-uploads/target/${target.type}/${target.id}`, VideoUploadsSchemas.TargetVideoStatusResponseSchema);
    },
    enabled: !!target && enabled,
    refetchInterval: (query) => query.state.data?.pendingVideo ? 3000 : false,
  });
  return { ...query, queryKey, queryClient };
}
