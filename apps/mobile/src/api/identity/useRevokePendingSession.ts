import { useMutation } from "@tanstack/react-query";

import { apiClient } from "../client";

/**
 * Logs out, on the server, the session a User signed in with while their
 * deletion is scheduled and who then cancelled the restore prompt. The session
 * was never stored, so the call carries its refresh token and no bearer.
 * Best effort, like logout: an unreachable server does not keep the person
 * from leaving, and the session still cannot change marketplace data.
 */
export function useRevokePendingSession() {
  return useMutation({
    mutationFn: async (refreshToken: string): Promise<void> => {
      try {
        await apiClient.post("/auth/logout", { refreshToken }, undefined, {
          auth: false,
        });
      } catch {
        // no-op
      }
    },
  });
}
