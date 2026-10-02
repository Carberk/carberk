import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router, usePathname } from "expo-router";

import { ApiError } from "../api/client";
import { clearAuthSession } from "../auth/session";
import { isConversationPath } from "../conversations/conversationRoutes";
import { useDirectMessagePushRouting } from "../notifications/useDirectMessagePushRouting";

/** Keep navigation subscriptions out of the root shell and its Stack. */
export function AppNavigationEffects() {
  const queryClient = useQueryClient();
  useDirectMessagePushRouting();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let redirecting = false;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action?.type !== "error") return;
      const error = event.query.state.error;
      if (!redirecting && error instanceof ApiError && error.code === "UNAUTHENTICATED") {
        void clearAuthSession();
        // This screen offers sign-in and preserves its Conversation return intent.
        if (isConversationPath(pathnameRef.current)) return;
        redirecting = true;
        queueMicrotask(() => router.replace("/(auth)/phone"));
      }
    });
    return unsubscribe;
  }, [queryClient]);
  return null;
}
