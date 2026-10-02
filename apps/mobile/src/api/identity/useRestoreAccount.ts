import { useMutation } from "@tanstack/react-query";

// Red checkpoint stub: the behavior lands in the next commit.
export function useRestoreAccount() {
  return useMutation({
    mutationFn: async (_accessToken: string): Promise<never> => {
      throw new Error("not implemented");
    },
  });
}
