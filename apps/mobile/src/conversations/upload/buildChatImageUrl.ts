const MEDIA_URL = (
  process.env["EXPO_PUBLIC_MEDIA_URL"] ?? ""
).replace(/\/$/, "");
const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";

export function buildChatImageUrl(key: string): string {
  if (key.startsWith("business-chat-private/")) return "";
  if (/^https?:\/\//i.test(key)) return key;
  if (!MEDIA_URL) return "";
  // The bucket and full stored object key are separate path segments.
  return `${MEDIA_URL}/${CHAT_ATTACHMENTS_BUCKET}/${key}`;
}
