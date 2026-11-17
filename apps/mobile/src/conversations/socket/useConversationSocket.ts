import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConversationsSchemas } from "@auto-tm/contracts";

import { queryKeys } from "../../api/queryKeys";

import {
  getSharedConversationSocket,
  type ConversationSocketStatus,
  type PresenceEvent,
  type SendMessageAck,
  type SocketErrorAck,
  type TypingEvent,
} from "./ConversationSocket";
import {
  handleMessageDeleted,
  handleMessageNew,
  handleWatermark,
} from "./conversationCacheSync";

const TYPING_DEBOUNCE_MS = 3000;
const PEER_TYPING_TIMEOUT_MS = 5000;

export interface PeerPresence {
  userId?: string;
  online: boolean;
  lastSeenAt?: string;
}

export interface UseConversationSocketReturn {
  status: ConversationSocketStatus;
  isConnected: boolean;
  peerTyping: boolean;
  peerPresence: PeerPresence;
  sendTextMessage: (input: {
    conversationId: string;
    text: string;
    clientMessageId: string;
  }) => Promise<SendMessageAck | SocketErrorAck>;
  sendImageMessage: (input: {
    conversationId: string;
    metadata: ConversationsSchemas.ImageMessageMetadata;
    clientMessageId: string;
  }) => Promise<SendMessageAck | SocketErrorAck>;
  signalTyping: () => void;
  stopTyping: () => void;
  markDelivered: (conversationId: string, timestamp?: string) => Promise<SocketErrorAck | { ok: true; conversationId: string }>;
  markRead: (conversationId: string, timestamp?: string) => Promise<SocketErrorAck | { ok: true; conversationId: string }>;
  deleteMessage: (input: {
    conversationId: string;
    messageId: string;
  }) => Promise<
    | { ok: true; messageId: string; conversationId: string; deletedAt: string }
    | { ok: false; code: string; message: string }
  >;
}

export function useConversationSocket(
  conversationId: string,
  currentUserId?: string,
): UseConversationSocketReturn {
  const queryClient = useQueryClient();
  const socketRef = useRef(getSharedConversationSocket());
  const joinedRef = useRef(false);
  const [status, setStatus] = useState<ConversationSocketStatus>(
    socketRef.current.getStatus(),
  );
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerPresence, setPeerPresence] = useState<PeerPresence>({
    online: false,
  });

  const typingStartSentRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isConnected = status === "connected";

  const signalTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!isConnected || !joinedRef.current) return;

    if (!typingStartSentRef.current) {
      typingStartSentRef.current = true;
      void socket.sendTypingStart(conversationId);
    }

    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }

    typingStopTimerRef.current = setTimeout(() => {
      typingStopTimerRef.current = null;
      if (typingStartSentRef.current) {
        typingStartSentRef.current = false;
        void socket.sendTypingStop(conversationId);
      }
    }, TYPING_DEBOUNCE_MS);
  }, [conversationId, isConnected]);

  const stopTyping = useCallback(() => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    if (typingStartSentRef.current) {
      typingStartSentRef.current = false;
      void socketRef.current.sendTypingStop(conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    const socket = socketRef.current;

    let active = true;
    let joining = false;
    let connectionVersion = 0;
    joinedRef.current = false;
    const join = () => {
      if (!active || joining || joinedRef.current || !conversationId) return;
      joining = true;
      const version = connectionVersion;
      void socket.joinConversation(conversationId).then((result) => {
        if (!active || version !== connectionVersion) return;
        joining = false;
        joinedRef.current = result.ok;
      });
    };

    let needsRecovery = socket.getStatus() === "disconnected" || socket.getStatus() === "error";
    const unsubscribeStatus = socket.subscribeStatus((next) => {
      setStatus(next);
      if (next === "connected") {
        join();
      } else {
        connectionVersion += 1;
        joining = false;
        joinedRef.current = false;
        setPeerTyping(false);
        setPeerPresence({ online: false });
        if (peerTypingTimerRef.current) {
          clearTimeout(peerTypingTimerRef.current);
          peerTypingTimerRef.current = null;
        }
        // Best-effort cleanup of any in-flight typing state.
        if (typingStartSentRef.current) {
          typingStartSentRef.current = false;
        }
      }
      if (next === "disconnected" || next === "error") needsRecovery = true;
      if (next === "connected" && needsRecovery) {
        needsRecovery = false;
        void queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.messages(conversationId),
        });
      }
    });

    const unsubscribeMessage = socket.subscribeMessage((event) => {
      if (event.message.conversationId !== conversationId) {
        return;
      }

      handleMessageNew(queryClient, event);
      if (currentUserId && event.message.senderId !== currentUserId) {
        void socket.markDelivered(event.message.conversationId, new Date().toISOString());
      }
    });

    const unsubscribeWatermark = socket.subscribeWatermark((event) => {
      handleWatermark(queryClient, event);
    });

    const unsubscribeDeleted = socket.subscribeDeletedMessage((event) => {
      handleMessageDeleted(queryClient, event);
    });

    const unsubscribeTyping = socket.subscribeTyping((event: TypingEvent) => {
      if (event.conversationId !== conversationId) return;
      if (currentUserId && event.userId === currentUserId) return;

      setPeerTyping(event.isTyping);

      if (event.isTyping) {
        if (peerTypingTimerRef.current) {
          clearTimeout(peerTypingTimerRef.current);
        }
        peerTypingTimerRef.current = setTimeout(() => {
          peerTypingTimerRef.current = null;
          setPeerTyping(false);
        }, PEER_TYPING_TIMEOUT_MS);
      } else if (peerTypingTimerRef.current) {
        clearTimeout(peerTypingTimerRef.current);
        peerTypingTimerRef.current = null;
      }
    });

    const unsubscribePresence = socket.subscribePresence((event: PresenceEvent) => {
      if (event.conversationId !== conversationId) return;
      if (currentUserId && event.userId === currentUserId) return;

      setPeerPresence({
        userId: event.userId,
        online: event.online,
        lastSeenAt: event.lastSeenAt,
      });
    });

    // connect() is a no-op when the authenticated shared socket is connected.
    // Subscribe to room events first, then join even when no status is emitted.
    void socket.connect().then(() => {
      if (!active) return;
      const current = socket.getStatus();
      setStatus(current);
      if (current === "connected") join();
    });

    return () => {
      active = false;
      unsubscribeStatus();
      unsubscribeMessage();
      unsubscribeWatermark();
      unsubscribeDeleted();
      unsubscribeTyping();
      unsubscribePresence();
      stopTyping();
      if (peerTypingTimerRef.current) {
        clearTimeout(peerTypingTimerRef.current);
        peerTypingTimerRef.current = null;
      }
      void socket.leaveConversation(conversationId);
      joinedRef.current = false;
    };
  }, [conversationId, currentUserId, queryClient, stopTyping]);

  const sendTextMessage = useCallback(
    async (input: {
      conversationId: string;
      text: string;
      clientMessageId: string;
    }): Promise<SendMessageAck | SocketErrorAck> => {
      return socketRef.current.sendTextMessage(input);
    },
    [],
  );

  const sendImageMessage = useCallback(
    async (input: {
      conversationId: string;
      metadata: ConversationsSchemas.ImageMessageMetadata;
      clientMessageId: string;
    }): Promise<SendMessageAck | SocketErrorAck> => {
      return socketRef.current.sendImageMessage(input);
    },
    [],
  );

  const markDelivered = useCallback(
    async (id: string, timestamp = new Date().toISOString()) => {
      return socketRef.current.markDelivered(id, timestamp);
    },
    [],
  );

  const markRead = useCallback(
    async (id: string, timestamp = new Date().toISOString()) => {
      return socketRef.current.markConversationRead(id, timestamp);
    },
    [],
  );

  const deleteMessage = useCallback(
    async (input: {
      conversationId: string;
      messageId: string;
    }): Promise<
      | { ok: true; messageId: string; conversationId: string; deletedAt: string }
      | { ok: false; code: string; message: string }
    > => {
      return socketRef.current.deleteMessage(input);
    },
    [],
  );

  return useMemo(
    () => ({
      status,
      isConnected,
      peerTyping,
      peerPresence,
      sendTextMessage,
      sendImageMessage,
      signalTyping,
      stopTyping,
      markDelivered,
      markRead,
      deleteMessage,
    }),
    [
      status,
      isConnected,
      peerTyping,
      peerPresence,
      sendTextMessage,
      sendImageMessage,
      signalTyping,
      stopTyping,
      markDelivered,
      markRead,
      deleteMessage,
    ],
  );
}

