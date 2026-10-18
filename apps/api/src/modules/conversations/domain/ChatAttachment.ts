export const CHAT_ATTACHMENT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ChatAttachmentExtension = "jpg" | "webp";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ATTACHMENT_FILE = new RegExp(`^${UUID}/original\\.(jpg|webp)$`);

export function chatAttachmentKey(
  conversationId: string,
  attachmentId: string,
  extension: ChatAttachmentExtension,
  business = false,
): string {
  return `${business ? "business-chat-private" : "chat-attachments"}/${conversationId}/${attachmentId}/original.${extension}`;
}

/** True only for a key the attachment presign issued for this Conversation. */
export function isChatAttachmentKeyOf(conversationId: string, key: string, business = false): boolean {
  const prefix = `${business ? "business-chat-private" : "chat-attachments"}/${conversationId}/`;
  return key.startsWith(prefix) && ATTACHMENT_FILE.test(key.slice(prefix.length));
}
