import { useMutation } from "@tanstack/react-query";

// Red checkpoint stub: the behavior lands in the next commit.
export function useRevokePendingSession() {
  return useMutation({
    mutationFn: async (_refreshToken: string): Promise<void> => {},
  });
}
