import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { ConversationsSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";
import { queryKeys } from "../queryKeys";

interface UseConversationMessagesOptions {
  conversationId: string;
  limit?: number;
}

export function useConversationMessages(opts: UseConversationMessagesOptions) {
  const { conversationId, limit = 20 } = opts;
  const queryClient = useQueryClient();
  const currentConversationId = useRef(conversationId);
  currentConversationId.current = conversationId;
  const [newestPageState, setNewestPageState] = useState<{ conversationId: string; pending: boolean } | null>(null);
  const newestPageReady = useRef<string | null>(null);

  useEffect(() => queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || currentConversationId.current !== conversationId ||
      event.query !== queryClient.getQueryCache().find({ queryKey: queryKeys.conversations.messages(conversationId), exact: true })) return;
    if (event.action.type === "error") newestPageReady.current = null;
    if (event.action.type === "success" && !event.action.manual && newestPageReady.current === conversationId) {
      newestPageReady.current = null;
      setNewestPageState({ conversationId, pending: false });
    }
  }), [conversationId, queryClient]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.conversations.messages(conversationId),
    queryFn: async ({ pageParam }) => {
      const newestPage = pageParam === null;
      if (newestPage && currentConversationId.current === conversationId) {
        newestPageReady.current = null;
        setNewestPageState({ conversationId, pending: true });
      }
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      const page = await apiClient.get(
        `/conversations/${conversationId}/messages?${params.toString()}`,
        ConversationsSchemas.ListMessagesResponseSchema,
      );
      if (newestPage && currentConversationId.current === conversationId) newestPageReady.current = conversationId;
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
    enabled: !!conversationId,
  });
  return { ...query, newestPagePending: newestPageState?.conversationId === conversationId && newestPageState.pending === true };
}

/** Persist the durable acknowledgement before the local outbox is reconciled. */
export function cacheAcknowledgedMessage(client: QueryClient, message: ConversationsSchemas.MessageSummary) {
  const key = queryKeys.conversations.messages(message.conversationId);
  const hadData = client.getQueryData(key) !== undefined;
  // A refetch started before the commit must not overwrite the acknowledged row.
  void client.cancelQueries({ queryKey: key });
  client.setQueryData<InfiniteData<ConversationsSchemas.ListMessagesResponse>>(key, (previous) => {
    // A deletion that landed before the acknowledgement stays authoritative;
    // the late acknowledgement must not revive the redacted Message.
    let redacted = false;
    const pages = (previous?.pages.length ? previous.pages : [{ items: [], nextCursor: null }]).map((page) => ({
      ...page,
      items: page.items.filter((row) => {
        const sameRow = row.id === message.id || (message.clientMessageId ? row.clientMessageId === message.clientMessageId : false);
        if (!sameRow) return true;
        if (row.deletedAt) {
          redacted = true;
          return true;
        }
        return false;
      }),
    }));
    const first = pages[0];
    if (first && !redacted) first.items = [message, ...first.items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { ...previous, pages, pageParams: previous?.pageParams ?? [null] };
  });
  // If the first history read was still loading, restart it after the commit to
  // recover older history as well as the acknowledged newest Message.
  if (!hadData) void client.invalidateQueries({ queryKey: key });
}
