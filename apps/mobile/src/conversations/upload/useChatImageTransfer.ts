import { useEffect, useRef } from "react";
import { ConversationsSchemas } from "@auto-tm/contracts";

import { usePresignChatAttachment } from "../../api/conversations/usePresignChatAttachment";
import { ApiError, apiClient } from "../../api/client";
import { captureRouteSnapshot } from "../../api/routes";
import { capturePhotoSession, type ProfilePhotoSession } from "../../identity/profilePhotoSession";

import { uploadChatImageToPresignedUrl, type ChatImageAttachment } from "./chatImageUpload";

type Transfer = { attachment: ChatImageAttachment; owner?: ProfilePhotoSession; key?: string; putConfirmed?: boolean; job?: Promise<ConversationsSchemas.ImageMessageMetadata> };

/** One issuance/payload per pending Message; retry never replaces the key or replays a Message. */
export function useChatImageTransfer(conversationId: string) {
  const presign = usePresignChatAttachment();
  const transfers = useRef(new Map<string, Transfer>());
  const activeConversation = useRef(conversationId);
  activeConversation.current = conversationId;
  useEffect(() => {
    const owned = transfers.current;
    return () => { for (const transfer of owned.values()) transfer.owner?.dispose(); owned.clear(); };
  }, [conversationId]);

  async function current(clientMessageId: string) {
    const transfer = transfers.current.get(clientMessageId);
    if (activeConversation.current !== conversationId || !transfer?.owner) throw new Error("Image selection ended");
    return transfer.owner.current();
  }

  function prepare(clientMessageId: string, attachment: ChatImageAttachment) {
    const route = captureRouteSnapshot();
    let transfer = transfers.current.get(clientMessageId);
    if (!transfer) { transfer = { attachment }; transfers.current.set(clientMessageId, transfer); }
    const retained = transfer;
    if (["uri", "width", "height", "fileSize"].some(field => retained.attachment[field as keyof ChatImageAttachment] !== attachment[field as keyof ChatImageAttachment])) return Promise.reject(new Error("Image selection changed"));
    retained.job ??= (async () => {
      retained.owner ??= await capturePhotoSession();
      if (transfers.current.get(clientMessageId) !== retained || activeConversation.current !== conversationId) { retained.owner.dispose(); throw new Error("Image selection ended"); }
      const assertSession = () => current(clientMessageId);
      await assertSession();
      const metadata = () => {
        if (!retained.key) throw new ApiError("CONTRACT_VIOLATION", 502);
        return { key: retained.key, width: attachment.width, height: attachment.height };
      };
      if (retained.putConfirmed) return metadata();
      const request = { contentType: "image/webp" as const, sizeBytes: attachment.fileSize };
      let grant: { uploadUrl: string; headers?: Record<string, string> };
      if (retained.key) {
        try {
          const renewed = await apiClient.post(`/conversations/${conversationId}/attachments/renew`, { ...request, key: retained.key }, ConversationsSchemas.RenewChatAttachmentResponseSchema, { assertSession });
          if (renewed.key !== retained.key) throw new ApiError("CONTRACT_VIOLATION", 502);
          if (renewed.state === "present") return metadata();
          grant = renewed;
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== "UPLOAD_NOT_AVAILABLE") throw error;
          // A committed/cleaned object can refuse renewal. Only the original
          // same-clientMessageId send may reconcile it; this is not send success.
          await assertSession();
          return metadata();
        }
      } else {
        const issued = await presign.mutateAsync({ conversationId, request });
        retained.key = issued.key;
        grant = issued;
      }
      await assertSession();
      await uploadChatImageToPresignedUrl(grant.uploadUrl, attachment.uri, grant.headers, route, assertSession);
      await assertSession();
      retained.putConfirmed = true;
      return metadata();
    })().finally(() => { retained.job = undefined; });
    return retained.job;
  }
  return { prepare, current };
}
