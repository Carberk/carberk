/** The Messages tab: the list every Conversation falls back to. */
export const MESSAGES_HREF = "/(tabs)/chat" as const;

/** The Conversation route, addressed by ID alone (see CONTEXT.md). */
export function conversationHref(conversationId: string) {
  return {
    pathname: "/conversations/[id]",
    params: { id: conversationId },
  } as const;
}

const CONVERSATION_PATH = /^\/conversations\/([^/?#]+)$/;

/**
 * Whether `pathname` (as `usePathname` reports it) is the Conversation route,
 * optionally for one Conversation. `open-listing` is a sibling route, not an ID.
 */
export function isConversationPath(
  pathname: string,
  conversationId?: string,
): boolean {
  const id = CONVERSATION_PATH.exec(pathname)?.[1];
  if (!id || id === "open-listing") {
    return false;
  }
  return conversationId === undefined || id === conversationId;
}
