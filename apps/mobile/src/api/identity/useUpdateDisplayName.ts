import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AuthSchemas, type IdentitySchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

/**
 * Sets the signed-in User's Display Name with `PATCH /me`. The answer is the
 * updated `/me`, written into the cache here rather than in the screen, so
 * Profile and Cabinet show the new name even when the User left the editor
 * before the save landed.
 */
export function useUpdateDisplayName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (displayName: string) =>
      apiClient.patch(
        "/me",
        { displayName } satisfies IdentitySchemas.UpdateMeRequest,
        AuthSchemas.MeResponseSchema,
      ),
    onSuccess: async (me) => {
      // A /me read that started before the save would otherwise land after it
      // and put the old name back.
      await queryClient.cancelQueries({ queryKey: queryKeys.me() });
      queryClient.setQueryData(queryKeys.me(), me);
    },
  });
}
