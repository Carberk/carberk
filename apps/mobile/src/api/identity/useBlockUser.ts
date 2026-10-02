import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IdentitySchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useBlockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { userId: string }) =>
      apiClient.post(
        "/me/blocked-users",
        input,
        IdentitySchemas.BlockUserResponseSchema,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
