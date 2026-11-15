export interface ChatAttachmentIssuance {
  key: string;
  senderId: string;
  conversationId: string;
  contentType: string;
  sizeBytes: number;
}

export interface ChatAttachmentUploadRepository {
  record(issuance: ChatAttachmentIssuance): Promise<void>;
  /** Includes soft-deleted image Messages, regardless of the Message's sender. */
  find(key: string): Promise<(ChatAttachmentIssuance & { committed: boolean }) | null>;
}

export const CHAT_ATTACHMENT_UPLOAD_REPOSITORY = Symbol("ChatAttachmentUploadRepository");
