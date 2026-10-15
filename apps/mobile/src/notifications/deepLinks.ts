/**
 * Parses the notification `data` payload of a direct-message push and returns
 * the target conversation id, or `null` when the payload is not a
 * direct-message deep link.
 *
 * Two shapes are supported because the worker push payload carries both:
 * - `data.conversationId` — the raw id from `DirectMessageNotification.data`.
 * - `data.deepLink` — the `/conversations/{id}` deep link string that the
 *   transport layer delivers alongside the notification.
 */
export function parseDirectMessageConversationId(
  data: unknown,
): string | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;

  if (record["kind"] === "service_update") return null;

  const conversationId = record["conversationId"];
  if (typeof conversationId === "string" && conversationId.length > 0) {
    return conversationId;
  }

  const deepLink = record["deepLink"];
  if (typeof deepLink === "string") {
    const match = /^\/conversations\/([^/?#]+)/.exec(deepLink);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function parseServiceConversationId(data: unknown): string | null {
 if (!data || typeof data !== "object" || Array.isArray(data)) return null;
 const value = data as Record<string, unknown>;
 return value["kind"] === "service_update" && typeof value["conversationId"] === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value["conversationId"]) ? value["conversationId"] : null;
}
