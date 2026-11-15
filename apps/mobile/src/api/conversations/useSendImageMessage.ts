import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ConversationsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

export function useSendImageMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      conversationId: string;
      metadata: ConversationsSchemas.ImageMessageMetadata;
      clientMessageId?: string;
      assertSession?: () => Promise<unknown>;
    }) =>
      apiClient.post(
        `/conversations/${input.conversationId}/messages/rich`,
        {
          kind: "image",
          metadata: input.metadata,
          clientMessageId: input.clientMessageId,
        },
        ConversationsSchemas.SendMessageResponseSchema,
        { assertSession: input.assertSession },
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
