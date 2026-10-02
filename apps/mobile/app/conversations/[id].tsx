import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ConversationsSchemas } from "@auto-tm/contracts";

import { useViewer } from "../../src/auth/useViewer";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { ApiError } from "../../src/api/client";
import { useConversationMessages } from "../../src/api/conversations/useConversationMessages";
import {
  patchConversationDetail,
  useConversation,
} from "../../src/api/conversations/useConversation";
import { queryKeys } from "../../src/api/queryKeys";
import { useConfig } from "../../src/api/admin/useConfig";
import { useSendTextMessage } from "../../src/api/conversations/useSendTextMessage";
import { useSendImageMessage } from "../../src/api/conversations/useSendImageMessage";
import { usePresignChatAttachment } from "../../src/api/conversations/usePresignChatAttachment";
import { useUpdateWatermark } from "../../src/api/conversations/useUpdateWatermark";
import { useDeleteMessage } from "../../src/api/conversations/useDeleteMessage";
import { useMuteConversation } from "../../src/api/conversations/useMuteConversation";
import { useBrands } from "../../src/api/catalog/useBrands";
import { useModels } from "../../src/api/catalog/useModels";
import { useSafeBack } from "../../src/navigation/useSafeBack";
import { useConversationSocket } from "../../src/conversations/socket/useConversationSocket";
import { useBlockUser } from "../../src/api/identity/useBlockUser";
import { useUnblockUser } from "../../src/api/identity/useUnblockUser";
import { ConversationListingCard } from "../../src/conversations/components/ConversationListingCard";
import { ConversationHeader } from "../../src/conversations/components/ConversationHeader";
import { ConversationFooter } from "../../src/conversations/components/ConversationFooter";
import {
  ConversationNotFoundState,
  ConversationSignedOutState,
} from "../../src/conversations/components/ConversationEntryStates";
import {
  MESSAGES_HREF,
  conversationHref,
} from "../../src/conversations/conversationRoutes";
import { useConversationCallPhone } from "../../src/conversations/useConversationCallPhone";
import { MessageList } from "../../src/conversations/components/MessageList";
import type { ComposerAttachment } from "../../src/conversations/components/MessageComposer";
import { ImagePreviewModal } from "../../src/conversations/components/ImagePreviewModal";
import { useConversationCatalogMaps } from "../../src/conversations/components/useConversationCatalogMaps";
import { showQuickReplies } from "../../src/conversations/showQuickReplies";
import type { MessageStatus } from "../../src/conversations/components/MessageBubble";
import { outgoingStatus } from "../../src/conversations/outgoingStatus";
import { MessageReportSheet } from "../../src/admin/components/MessageReportSheet";
import { ReportSheet } from "../../src/admin/components/ReportSheet";
import {
  uploadChatImageToPresignedUrl,
  ChatImageUploadError,
} from "../../src/conversations/upload/chatImageUpload";

import { Text } from "@/components/ui/text";
import { Skeleton } from "@/components/ui/skeleton";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { ErrorState } from "@/components/ErrorState";
import { useToast } from "@/components/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LocalMessage {
  id: string;
  clientMessageId: string;
  senderId: string;
  kind: "text" | "image" | "post_ref";
  text: string;
  metadata?:
    | { key: string; width?: number; height?: number }
    | ConversationsSchemas.PostRefMessageMetadata;
  localImageUri?: string;
  imageFileSize?: number;
  imageWidth?: number;
  imageHeight?: number;
  createdAt: string;
  status: MessageStatus;
  deletedAt?: string | null;
  canDelete?: boolean;
  postRefBrandName?: string;
  postRefModelName?: string;
}

/** The API refuses a Conversation that is gone (404) or not the viewer's (403). */
function isUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 403);
}

function generateClientMessageId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ConversationDetailScreen() {
  const { t } = useTranslation();
  // The route carries only the Conversation ID and an optional composer draft;
  // everything else is read by ID (see src/conversations/CONTEXT.md).
  const params = useLocalSearchParams<{ id?: string; draft?: string }>();
  const rawId = params.id;
  const conversationId = typeof rawId === "string" ? rawId : "";
  const draft = typeof params.draft === "string" ? params.draft : undefined;
  const viewer = useViewer();
  const router = useRouter();
  const goBack = useSafeBack(MESSAGES_HREF);
  // Nothing is read until a User is signed in; signed out, the screen offers
  // sign-in and returns here (see src/conversations/CONTEXT.md).
  const signedOut = viewer === null;
  const readId = viewer?.userId ? conversationId : "";

  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const readMarkedRef = useRef(false);
  const [confirmAction, setConfirmAction] = useState<
    "block" | "unblock" | null
  >(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [messageToReport, setMessageToReport] = useState<string | null>(null);
  const [reportUserOpen, setReportUserOpen] = useState(false);
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<string>>(
    new Set(),
  );
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const messagesQuery = useConversationMessages({ conversationId: readId });
  const sendHttpMessage = useSendTextMessage();
  const sendHttpImageMessage = useSendImageMessage();
  const presignChatAttachment = usePresignChatAttachment();
  const updateWatermark = useUpdateWatermark();
  const deleteHttpMessage = useDeleteMessage();
  const {
    peerTyping,
    peerPresence,
    signalTyping,
    stopTyping,
    sendTextMessage,
    sendImageMessage,
    markRead: socketMarkRead,
    deleteMessage,
  } = useConversationSocket(conversationId, viewer?.userId);

  const queryClient = useQueryClient();
  const { data: config } = useConfig();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const muteConversation = useMuteConversation();
  const { show: showToast } = useToast();

  const conversationQuery = useConversation(readId);
  const notFound =
    isUnavailable(conversationQuery.error) || isUnavailable(messagesQuery.error);
  // A Conversation the API refuses shows nothing, even from cache.
  const conversation = notFound ? undefined : conversationQuery.data;
  const listingCard = conversation?.listing ?? null;
  const callPhone = useConversationCallPhone(conversation);

  const { data: brandsData } = useBrands();
  const { data: modelsData } = useModels(listingCard?.brandId ?? "");

  const brandName = useMemo(() => {
    if (!listingCard?.brandId) return undefined;
    return brandsData?.items.find((b) => b.id === listingCard.brandId)?.name;
  }, [brandsData, listingCard?.brandId]);

  const modelName = useMemo(() => {
    if (!listingCard?.modelId) return undefined;
    return modelsData?.items.find((m) => m.id === listingCard.modelId)?.name;
  }, [modelsData, listingCard?.modelId]);

  const postRefListings = useMemo(
    () =>
      messagesQuery.data?.pages
        .flatMap((page) => page.items)
        .filter(
          (
            m,
          ): m is ConversationsSchemas.MessageSummary & {
            metadata: ConversationsSchemas.PostRefMessageMetadata;
          } =>
            m.kind === "post_ref" &&
            m.metadata != null &&
            "listingId" in m.metadata,
        )
        .map((m) => ({
          brandId: m.metadata.brandId,
          modelId: m.metadata.modelId,
        })) ?? [],
    [messagesQuery.data],
  );

  const postRefCatalogMaps = useConversationCatalogMaps(postRefListings);

  const peerWatermark = useMemo(
    () => ({
      peerLastReadAt: conversation?.peerLastReadAt,
      peerLastDeliveredAt: conversation?.peerLastDeliveredAt,
    }),
    [conversation?.peerLastReadAt, conversation?.peerLastDeliveredAt],
  );

  const isMuted = conversation?.mutedAt != null;

  const otherUserId = conversation?.peer.id;

  // Read from the loaded Conversation, never a separate request (#352 D3).
  const isBlocked =
    conversation?.blockedByMe === true ||
    conversation?.sendRestriction === "blocked_by_me";

  // Block and Unblock patch the by-ID entry so the footer switches at once,
  // then refresh it and the list from the API.
  const applyBlocked = useCallback(
    (blocked: boolean) => {
      patchConversationDetail(queryClient, conversationId, {
        blockedByMe: blocked,
        sendRestriction: blocked ? "blocked_by_me" : null,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.detail(conversationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(),
      });
    },
    [conversationId, queryClient],
  );

  const handleBlock = useCallback(() => {
    if (!otherUserId) return;
    blockUser.mutate(
      { userId: otherUserId },
      {
        onSuccess: () => {
          setConfirmAction(null);
          applyBlocked(true);
        },
      },
    );
  }, [applyBlocked, blockUser, otherUserId]);

  const handleUnblock = useCallback(() => {
    if (!otherUserId) return;
    unblockUser.mutate(
      { userId: otherUserId },
      {
        onSuccess: () => {
          setConfirmAction(null);
          applyBlocked(false);
        },
      },
    );
  }, [applyBlocked, unblockUser, otherUserId]);

  const handleToggleMute = useCallback(() => {
    if (!conversationId) return;
    muteConversation.mutate(
      { conversationId, muted: !isMuted },
      {
        onError: () => {
          showToast({
            title: t("muteConversationError"),
            variant: "destructive",
          });
        },
      },
    );
  }, [conversationId, isMuted, muteConversation, showToast, t]);

  const allMessages: LocalMessage[] = useMemo(() => {
    const { peerLastReadAt, peerLastDeliveredAt } = peerWatermark;
    const viewerId = viewer?.userId;
    const now = Date.now();
    const deleteWindowMs = 5 * 60 * 1000;

    const serverMessages: LocalMessage[] =
      messagesQuery.data?.pages.flatMap(
        (page) =>
          page.items.map((m) => {
            const kind: LocalMessage["kind"] =
              m.kind === "image" || m.kind === "post_ref" ? m.kind : "text";

            let metadata: LocalMessage["metadata"];
            if (kind === "image" && m.metadata && "key" in m.metadata) {
              metadata = {
                key: m.metadata.key,
                width: m.metadata.width,
                height: m.metadata.height,
              };
            } else if (
              kind === "post_ref" &&
              m.metadata &&
              "listingId" in m.metadata
            ) {
              metadata = {
                listingId: m.metadata.listingId,
                brandId: m.metadata.brandId,
                modelId: m.metadata.modelId,
                year: m.metadata.year,
                displayPriceTmt: m.metadata.displayPriceTmt,
                priceCurrency: m.metadata.priceCurrency,
                coverMediaKey: m.metadata.coverMediaKey,
                status: m.metadata.status,
                available: m.metadata.available ?? true,
              };
            }

            const postRefMeta =
              kind === "post_ref" && metadata && "listingId" in metadata
                ? metadata
                : undefined;

            return {
              id: m.id,
              clientMessageId: m.clientMessageId ?? m.id,
              senderId: m.senderId,
              kind,
              text: m.text ?? "",
              metadata,
              createdAt: m.createdAt,
              status:
                m.senderId === viewerId
                  ? outgoingStatus(
                      m.createdAt,
                      peerLastReadAt,
                      peerLastDeliveredAt,
                    )
                  : ("sent" as MessageStatus),
              deletedAt: m.deletedAt,
              canDelete:
                m.senderId === viewerId &&
                !m.deletedAt &&
                now - new Date(m.createdAt).getTime() <= deleteWindowMs,
              postRefBrandName: postRefMeta
                ? postRefCatalogMaps.brandName(postRefMeta.brandId)
                : undefined,
              postRefModelName: postRefMeta
                ? postRefCatalogMaps.modelName(postRefMeta.modelId)
                : undefined,
            };
          }),
      ) ?? [];

    const serverIds = new Set(serverMessages.map((m) => m.id));
    const serverClientIds = new Set(
      serverMessages.map((m) => m.clientMessageId).filter(Boolean),
    );
    const pendingOrFailed = localMessages.filter(
      (lm) =>
        lm.status !== "sent" &&
        lm.status !== "delivered" &&
        lm.status !== "read" &&
        !serverIds.has(lm.id) &&
        !serverClientIds.has(lm.clientMessageId),
    );

    return [...serverMessages, ...pendingOrFailed].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [
    messagesQuery.data,
    localMessages,
    peerWatermark,
    viewer?.userId,
    postRefCatalogMaps,
  ]);

  const markRead = useCallback(
    async (timestamp = new Date().toISOString()) => {
      if (!viewer?.userId || !conversationId || readMarkedRef.current) return;
      readMarkedRef.current = true;

      const result = await socketMarkRead(conversationId, timestamp);
      if (!result.ok) {
        // Fallback to HTTP if socket is not connected.
        updateWatermark.mutate({
          conversationId,
          lastReadAt: timestamp,
        });
      }
    },
    [conversationId, socketMarkRead, updateWatermark, viewer?.userId],
  );

  // Mark conversation read once messages have loaded and the user is viewing it.
  useEffect(() => {
    if (
      !messagesQuery.isPending &&
      !messagesQuery.isError &&
      viewer?.userId &&
      conversationId &&
      !readMarkedRef.current
    ) {
      void markRead();
    }
  }, [
    messagesQuery.isPending,
    messagesQuery.isError,
    viewer?.userId,
    conversationId,
    markRead,
  ]);

  const markConfirmed = useCallback((
    clientMessageId: string,
    serverId: string,
    kind: "text" | "image" = "text",
    metadata?: { key: string; width?: number; height?: number },
  ) => {
    setLocalMessages((prev) =>
      prev.map((m) => {
        if (m.clientMessageId !== clientMessageId) return m;
        if (m.localImageUri) {
          FileSystem.deleteAsync(m.localImageUri, { idempotent: true }).catch(
            () => {},
          );
        }
        return {
          ...m,
          id: serverId,
          status: "sent",
          kind,
          metadata,
          localImageUri: undefined,
          imageFileSize: undefined,
        };
      }),
    );
  }, []);

  const markFailed = useCallback((clientMessageId: string) => {
    setLocalMessages((prev) =>
      prev.map((m) =>
        m.clientMessageId === clientMessageId ? { ...m, status: "failed" } : m,
      ),
    );
  }, []);

  const sendViaHttp = useCallback(
    (clientMessageId: string, text: string) => {
      sendHttpMessage.mutate(
        { conversationId, text },
        {
          onSuccess: (data) => {
            markConfirmed(clientMessageId, data.id);
          },
          onError: () => {
            markFailed(clientMessageId);
          },
        },
      );
    },
    [conversationId, markConfirmed, markFailed, sendHttpMessage],
  );

  const sendImageViaHttp = useCallback(
    (
      clientMessageId: string,
      metadata: ConversationsSchemas.ImageMessageMetadata,
      localUri: string,
    ) => {
      sendHttpImageMessage.mutate(
        { conversationId, metadata, clientMessageId },
        {
          onSuccess: (data) => {
            markConfirmed(clientMessageId, data.id, "image", metadata);
            FileSystem.deleteAsync(localUri, { idempotent: true }).catch(
              () => {},
            );
          },
          onError: () => {
            markFailed(clientMessageId);
          },
        },
      );
    },
    [conversationId, markConfirmed, markFailed, sendHttpImageMessage],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!viewer?.userId || !conversationId || isBlocked) return;

      const clientMessageId = generateClientMessageId();
      const tempId = `pending-${clientMessageId}`;
      const pendingMessage: LocalMessage = {
        id: tempId,
        clientMessageId,
        senderId: viewer.userId,
        kind: "text",
        text,
        createdAt: new Date().toISOString(),
        status: "pending",
        canDelete: false,
      };

      setLocalMessages((prev) => [...prev, pendingMessage]);

      const result = await sendTextMessage({
        conversationId,
        text,
        clientMessageId,
      });

      if (result.ok) {
        markConfirmed(clientMessageId, result.message.id);
      } else if (result.code === "NOT_CONNECTED") {
        sendViaHttp(clientMessageId, text);
      } else {
        markFailed(clientMessageId);
      }
    },
    [
      conversationId,
      isBlocked,
      markConfirmed,
      markFailed,
      sendViaHttp,
      sendTextMessage,
      viewer?.userId,
    ],
  );

  const handleSendImage = useCallback(
    async (attachment: ComposerAttachment) => {
      if (!viewer?.userId || !conversationId || isBlocked) return;

      const clientMessageId = generateClientMessageId();
      const tempId = `pending-${clientMessageId}`;
      const pendingMessage: LocalMessage = {
        id: tempId,
        clientMessageId,
        senderId: viewer.userId,
        kind: "image",
        text: "",
        localImageUri: attachment.uri,
        imageFileSize: attachment.fileSize,
        imageWidth: attachment.width,
        imageHeight: attachment.height,
        createdAt: new Date().toISOString(),
        status: "pending",
        canDelete: false,
      };

      setLocalMessages((prev) => [...prev, pendingMessage]);

      try {
        const presignResponse = await presignChatAttachment.mutateAsync({
          conversationId,
          request: {
            contentType: "image/jpeg",
            sizeBytes: attachment.fileSize,
          },
        });

        await uploadChatImageToPresignedUrl(
          presignResponse.uploadUrl,
          attachment.uri,
        );

        const metadata: ConversationsSchemas.ImageMessageMetadata = {
          key: presignResponse.key,
          width: attachment.width,
          height: attachment.height,
        };

        const result = await sendImageMessage({
          conversationId,
          metadata,
          clientMessageId,
        });

        if (result.ok) {
          markConfirmed(clientMessageId, result.message.id, "image", metadata);
          FileSystem.deleteAsync(attachment.uri, { idempotent: true }).catch(
            () => {},
          );
        } else if (result.code === "NOT_CONNECTED") {
          sendImageViaHttp(clientMessageId, metadata, attachment.uri);
        } else {
          markFailed(clientMessageId);
        }
      } catch (err) {
        const uploadError =
          err instanceof ChatImageUploadError
            ? err
            : new ChatImageUploadError(
                err instanceof Error ? err.message : "Image upload failed",
                "put_failed",
                true,
              );
        markFailed(clientMessageId);
        console.warn("Image message send failed", uploadError);
      }
    },
    [
      conversationId,
      isBlocked,
      markConfirmed,
      markFailed,
      presignChatAttachment,
      sendImageViaHttp,
      sendImageMessage,
      viewer?.userId,
    ],
  );

  const handleRetry = useCallback(
    async (tempId: string) => {
      if (!conversationId || isBlocked) return;
      const msg = localMessages.find((m) => m.id === tempId);
      if (!msg || msg.status !== "failed") return;

      setLocalMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "pending" } : m)),
      );

      if (msg.kind === "image" && msg.localImageUri) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(msg.localImageUri);
          if (!fileInfo.exists) {
            throw new ChatImageUploadError(
              "Local image file is missing",
              "file_missing",
              false,
            );
          }
          const fileSize = "size" in fileInfo ? fileInfo.size : (msg.imageFileSize ?? 0);

          const presignResponse = await presignChatAttachment.mutateAsync({
            conversationId,
            request: {
              contentType: "image/jpeg",
              sizeBytes: fileSize,
            },
          });

          await uploadChatImageToPresignedUrl(
            presignResponse.uploadUrl,
            msg.localImageUri,
          );

          const metadata: ConversationsSchemas.ImageMessageMetadata = {
            key: presignResponse.key,
            width: msg.imageWidth,
            height: msg.imageHeight,
          };

          const result = await sendImageMessage({
            conversationId,
            metadata,
            clientMessageId: msg.clientMessageId,
          });

          if (result.ok) {
            markConfirmed(msg.clientMessageId, result.message.id, "image", metadata);
            FileSystem.deleteAsync(msg.localImageUri, { idempotent: true }).catch(
              () => {},
            );
          } else if (result.code === "NOT_CONNECTED") {
            sendImageViaHttp(msg.clientMessageId, metadata, msg.localImageUri);
          } else {
            markFailed(msg.clientMessageId);
          }
        } catch {
          markFailed(msg.clientMessageId);
        }
        return;
      }

      const result = await sendTextMessage({
        conversationId,
        text: msg.text,
        clientMessageId: msg.clientMessageId,
      });

      if (result.ok) {
        markConfirmed(msg.clientMessageId, result.message.id);
      } else if (result.code === "NOT_CONNECTED") {
        sendViaHttp(msg.clientMessageId, msg.text);
      } else {
        markFailed(msg.clientMessageId);
      }
    }, [
      conversationId,
      isBlocked,
      localMessages,
      markConfirmed,
      markFailed,
      presignChatAttachment,
      sendImageMessage,
      sendImageViaHttp,
      sendTextMessage,
      sendViaHttp,
    ],
  );

  const deleteViaHttp = useCallback(
    (messageId: string) => {
      deleteHttpMessage.mutate({ conversationId, messageId });
    },
    [conversationId, deleteHttpMessage],
  );

  const handleDelete = useCallback(
    async (messageId: string) => {
      if (!conversationId || !viewer?.userId) return;
      setMessageToDelete(null);

      const result = await deleteMessage({
        conversationId,
        messageId,
      });

      if (!result.ok) {
        deleteViaHttp(messageId);
      }
    },
    [conversationId, deleteMessage, deleteViaHttp, viewer?.userId],
  );

  const confirmDeleteMessage = useCallback((messageId: string) => {
    setMessageToDelete(messageId);
  }, []);

  const cancelDelete = useCallback(() => {
    setMessageToDelete(null);
  }, []);

  const confirmReportMessage = useCallback((messageId: string) => {
    setMessageToReport(messageId);
  }, []);

  const cancelReport = useCallback(() => {
    setMessageToReport(null);
  }, []);

  const handleReported = useCallback((messageId: string) => {
    setReportedMessageIds((prev) => new Set(prev).add(messageId));
  }, []);

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = messagesQuery;
  const loadOlderMessages = useCallback(() => {
    // After a failure the inline row changes the list height and re-fires onEndReached near
    // the top; only Retry may fetch again, or a failing page loops.
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  const retryOlderMessages = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const handleSignIn = useCallback(() => {
    useAuthIntentStore.getState().requireSignIn(router, {
      returnTo: conversationHref(conversationId),
    });
  }, [router, conversationId]);

  const goToMessages = useCallback(() => {
    router.dismissTo(MESSAGES_HREF);
  }, [router]);

  const isLoading = messagesQuery.isPending;
  // A failed older page keeps the loaded pages; only fail the screen with nothing to show.
  const isError = messagesQuery.isError && !messagesQuery.data;
  // A Conversation that failed to load, with nothing cached to show instead.
  const conversationFailed = conversationQuery.isError && !conversation;

  const confirmDialogOpen = confirmAction !== null;
  const confirmTitle =
    confirmAction === "block"
      ? t("blockUserConfirmTitle")
      : t("unblockUserConfirmTitle");
  const confirmDescription =
    confirmAction === "block"
      ? t("blockUserConfirmDescription")
      : t("unblockUserConfirmDescription");
  const confirmActionLabel =
    confirmAction === "block"
      ? t("blockUserConfirmAction")
      : t("unblockUserConfirmAction");
  const onConfirm = confirmAction === "block" ? handleBlock : handleUnblock;

  return (
    <SafeScreen>
      <ConversationHeader
        conversation={conversation}
        loading={conversationQuery.isPending && !signedOut && !notFound}
        presence={peerPresence}
        callPhone={callPhone}
        isMuted={isMuted}
        isBlocked={isBlocked}
        muteDisabled={muteConversation.isPending}
        onBack={goBack}
        onToggleMute={handleToggleMute}
        onReport={
          otherUserId && config?.reportEntryEnabled !== false
            ? () => setReportUserOpen(true)
            : undefined
        }
        onBlock={() => setConfirmAction("block")}
        onUnblock={() => setConfirmAction("unblock")}
      />

      {conversation ? (
        <ConversationListingCard
          listing={listingCard}
          brandName={brandName}
          modelName={modelName}
        />
      ) : conversationQuery.isPending && !signedOut && !notFound ? (
        <ConversationListingCard loading />
      ) : null}

      {/* Messages */}
      <View className="flex-1">
        {signedOut ? (
          <ConversationSignedOutState onPress={handleSignIn} />
        ) : notFound ? (
          <ConversationNotFoundState onPress={goToMessages} />
        ) : isLoading ? (
          <View className="flex-1 px-4 py-4 gap-3">
            <View className="flex-row justify-end">
              <Skeleton className="h-10 w-2/3 rounded-2xl" />
            </View>
            <View className="flex-row justify-start">
              <Skeleton className="h-10 w-1/2 rounded-2xl" />
            </View>
            <View className="flex-row justify-end">
              <Skeleton className="h-10 w-3/5 rounded-2xl" />
            </View>
          </View>
        ) : conversationFailed || isError ? (
          <ErrorState
            error={conversationFailed ? conversationQuery.error : messagesQuery.error}
            onRetry={() => {
              if (conversationQuery.isError) void conversationQuery.refetch();
              if (messagesQuery.isError) void messagesQuery.refetch();
            }}
          />
        ) : viewer?.userId ? (
          <MessageList
            messages={allMessages}
            currentUserId={viewer.userId}
            reportedMessageIds={reportedMessageIds}
            onRetry={handleRetry}
            onDelete={confirmDeleteMessage}
            onReport={confirmReportMessage}
            onImagePress={(uri) => setPreviewUri(uri)}
            onPostRefPress={(listingId) =>
              router.push(`/(public)/listings/${listingId}`)
            }
            onLoadOlder={loadOlderMessages}
            loadingOlder={isFetchingNextPage}
            olderFailed={isFetchNextPageError && !isFetchingNextPage}
            onRetryOlder={retryOlderMessages}
          />
        ) : null}
      </View>

      <ConversationFooter
        isBlocked={isBlocked}
        unblockPending={unblockUser.isPending}
        onUnblock={() => setConfirmAction("unblock")}
        peerTyping={peerTyping && !notFound}
        composer={
          viewer?.userId && !notFound
            ? {
                onSend: handleSend,
                onSendImage: handleSendImage,
                disabled: blockUser.isPending || unblockUser.isPending,
                showQuickReplies: showQuickReplies({
                  conversation,
                  messages: allMessages,
                  hasOlderMessages: messagesQuery.hasNextPage,
                  loading: isLoading,
                  failed: isError || conversationFailed,
                  blocked: isBlocked,
                }),
                onTyping: signalTyping,
                onStopTyping: stopTyping,
                conversationId,
                initialText: draft,
              }
            : undefined
        }
      />

      {/* Block / Unblock confirmation */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setConfirmAction(null)}>
              <Text>{t("cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={onConfirm}
              disabled={blockUser.isPending || unblockUser.isPending}
            >
              <Text>{confirmActionLabel}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete message confirmation */}
      <AlertDialog open={!!messageToDelete} onOpenChange={cancelDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteMessageTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteMessageDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={cancelDelete}>
              <Text>{t("cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={() =>
                messageToDelete && handleDelete(messageToDelete)
              }
            >
              <Text>{t("delete")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report message sheet */}
      <MessageReportSheet
        conversationId={conversationId}
        messageId={messageToReport ?? ""}
        open={!!messageToReport}
        onOpenChange={(open) => {
          if (!open) cancelReport();
        }}
        onReported={handleReported}
      />

      {/* Report the other participant (a User report) */}
      {otherUserId && (
        <ReportSheet
          targetType="user"
          targetId={otherUserId}
          open={reportUserOpen}
          onOpenChange={setReportUserOpen}
        />
      )}

      {/* Fullscreen image preview */}
      <ImagePreviewModal
        uri={previewUri}
        onClose={() => setPreviewUri(null)}
      />
    </SafeScreen>
  );
}
