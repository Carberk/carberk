import { useMutation } from "@tanstack/react-query";
import { AuthSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";

/**
 * Restores a User whose deletion is scheduled, after they confirm the prompt.
 * The session is not stored yet, so the call carries the pending session's
 * access token (ADR-0032).
 */
export function useRestoreAccount() {
  return useMutation({
    mutationFn: (accessToken: string) =>
      apiClient.post(
        "/me/restore",
        undefined,
        AuthSchemas.RestoreAccountResponseSchema,
        { accessToken },
      ),
  });
}
