import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ConversationsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useSendTextMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { conversationId: string; text: string; clientMessageId?: string }) =>
      apiClient.post(
        `/conversations/${input.conversationId}/messages/rich`,
        { kind: "text", text: input.text, clientMessageId: input.clientMessageId },
        ConversationsSchemas.SendMessageResponseSchema,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.messages(variables.conversationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.unreadCounts(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(variables.conversationId),
      });
    },
  });
}
