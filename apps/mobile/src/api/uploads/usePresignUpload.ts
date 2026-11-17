import { useMutation } from "@tanstack/react-query";
import { UploadsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";

export function usePresignUpload() {
  return useMutation({
    mutationFn: ({ assertSession, ...request }: UploadsSchemas.PresignRequest & { assertSession?: () => Promise<unknown> }) =>
      apiClient.post(
        "/uploads/presign",
        request,
        UploadsSchemas.PresignResponseSchema,
        { assertSession },
      ),
  });
}
