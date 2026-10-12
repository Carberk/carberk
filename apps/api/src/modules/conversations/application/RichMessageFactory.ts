import { isChatAttachmentKeyOf } from "../domain/ChatAttachment";
import { Message } from "../domain/Message";
import type { ChatAttachmentCleaner } from "../domain/ports/ChatAttachmentCleaner";
import type { ImageMessageMetadata } from "../domain/types";
import {
  CONVERSATION_ERROR_CODES,
  ConversationDomainError,
} from "../domain/types";

export type RichMessageInput =
  | {
      kind: "text";
      text: string;
      clientMessageId?: string | undefined;
    }
  | {
      kind: "image";
      metadata: ImageMessageMetadata;
      clientMessageId?: string | undefined;
    };

export function createRichMessage(data: {
  id: string;
  conversationId: string;
  senderId: string;
  input: RichMessageInput;
}): Message {
  const messageData = {
    id: data.id,
    conversationId: data.conversationId,
    senderId: data.senderId,
    clientMessageId: data.input.clientMessageId,
  };

  switch (data.input.kind) {
    case "text":
      return Message.createText({ ...messageData, text: data.input.text });
    case "image":
      return Message.createImage({
        ...messageData,
        metadata: data.input.metadata,
      });
    default:
      throw new ConversationDomainError(
        CONVERSATION_ERROR_CODES.MESSAGE_KIND_NOT_SUPPORTED,
        "Message kind not supported",
      );
  }
}

/**
 * An image message hands its key to the other participant, who loads the
 * stored image as it is. So the image is cleaned of metadata first, and a key
 * that is not this Conversation's own attachment, or has no usable image
 * behind it, is refused. The stored metadata carries the cleaner's ThumbHash.
 */
export async function createCleanRichMessage(
  cleaner: ChatAttachmentCleaner,
  data: Parameters<typeof createRichMessage>[0],
): Promise<Message> {
  if (data.input.kind === "image") {
    const { key } = data.input.metadata;
    if (!isChatAttachmentKeyOf(data.conversationId, key)) {
      throw new ConversationDomainError(
        CONVERSATION_ERROR_CODES.IMAGE_ATTACHMENT_NOT_USABLE,
        "Image key is not an attachment of this conversation",
      );
    }
    const result = await cleaner.clean(key);
    if (result.status !== "clean") {
      throw new ConversationDomainError(
        CONVERSATION_ERROR_CODES.IMAGE_ATTACHMENT_NOT_USABLE,
        result.status === "missing"
          ? "Image has not been uploaded"
          : "Uploaded file is not a usable image",
      );
    }
    // Only the server's hash is stored: whatever the sender put in metadata
    // beyond its key and size is dropped.
    const { width, height } = data.input.metadata;
    return createRichMessage({
      ...data,
      input: {
        ...data.input,
        metadata: {
          key,
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
          thumbHash: result.thumbHash,
        },
      },
    });
  }
  return createRichMessage(data);
}
