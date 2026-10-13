/**
 * `clean`: the stored image is upright and carries no metadata; `thumbHash`
 * is its ThumbHash, standard padded base64 (#824).
 * `missing`: nothing is stored at the key.
 * `invalid`: the stored object is not a usable image.
 */
export type ChatAttachmentCleanResult =
  | { status: "clean"; thumbHash: string }
  | { status: "missing" }
  | { status: "invalid" };

export interface ChatAttachmentCleaner {
  clean(key: string): Promise<ChatAttachmentCleanResult>;
}

export const CHAT_ATTACHMENT_CLEANER = Symbol("ChatAttachmentCleaner");
