import { useMutation } from "@tanstack/react-query";
import { UploadsSchemas } from "@auto-tm/contracts";

import { useAuth } from "../../auth/useAuth";
import { loadAuthSession } from "../../auth/session";
import { ApiError , apiClient } from "../client";


export function usePresignUpload() {
  const { userId } = useAuth();
  return useMutation({
    mutationFn: (request: UploadsSchemas.PresignRequest) =>
      apiClient.post(
        "/uploads/presign",
        request,
        UploadsSchemas.PresignResponseSchema,
        { assertSession: async () => { if (!userId || (await loadAuthSession())?.user.id !== userId) throw new ApiError("FORBIDDEN", 403, "Inventory session changed"); } },
      ),
  });
}
