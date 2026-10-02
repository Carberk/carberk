import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IdentitySchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useUnblockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { userId: string }) =>
      apiClient.delete(
        `/me/blocked-users/${input.userId}`,
        IdentitySchemas.UnblockUserResponseSchema,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
