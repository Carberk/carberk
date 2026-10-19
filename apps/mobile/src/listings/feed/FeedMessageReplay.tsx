import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useReplayAuthActionOfKind, type AuthHref } from "../../auth/intentStore";
import { useOpenListingConversation } from "../../conversations/useOpenListingConversation";

import { useToast } from "@/components/ui/toast";

/**
 * Finishes a Message that a signed-out tap on a Results card left waiting,
 * once sign-in returns to this screen (`returnTo`, the href the card passed
 * to `requireSignIn`) and the screen has focus. It lives on the screen, not
 * the card, for the reason `useFeedFavoriteReplay` gives: after sign-in the
 * feed reloads only its first page, so the card that asked may be gone.
 * It opens the Conversation through `useOpenListingConversation`, as
 * detail's Message does after sign-in; a failure shows an error toast.
 */
export function FeedMessageReplay({ returnTo }: { returnTo: AuthHref }) {
  const isFocused = useIsFocused();
  const [replay, setReplay] = useState<{ listingId: string; attempt: number } | null>(null);
  useReplayAuthActionOfKind(
    "message",
    returnTo,
    (listingId) => setReplay((previous) => ({ listingId, attempt: (previous?.attempt ?? 0) + 1 })),
    isFocused,
  );
  return replay ? <OpenConversation key={replay.attempt} listingId={replay.listingId} /> : null;
}

/** Opens the Conversation once on mount. Mounted only for a replay, so the toast host is needed only then. */
function OpenConversation({ listingId }: { listingId: string }) {
  const { t } = useTranslation();
  const { show } = useToast();
  const conversation = useOpenListingConversation(listingId);
  const open = useRef(conversation.open);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    open.current();
  }, []);

  useEffect(() => {
    if (conversation.error) show({ title: t("somethingWentWrong"), variant: "destructive", placement: "aboveTabBar" });
  }, [conversation.error, show, t]);

  return null;
}
