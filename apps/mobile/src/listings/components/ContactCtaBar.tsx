import { View } from "react-native";
import { useRouter } from "expo-router";
import { Phone, MessageCircle } from "lucide-react-native";
import { Enums } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { emitMeasurement } from "../../measurement/nativeMeasurement";
import { openSellerDialer } from "../openSellerDialer";
import { useAuth } from "../../auth/useAuth";
import {
  useAuthIntentStore,
  useReplayAuthAction,
} from "../../auth/intentStore";
import { useOpenListingConversation } from "../../conversations/useOpenListingConversation";

import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useLargeText } from "@/lib/font-scale";
import { cn } from "@/lib/utils";

interface ContactCtaBarProps {
  listingId: string;
  contactPhone?: string;
  allowCalls: boolean;
  allowChat: boolean;
  status: Enums.ListingStatus;
  /** The full detail has not loaded: both actions stay disabled until it does. */
  pending?: boolean;
  /**
   * `viewer` sits on the black photo viewer: light-on-dark buttons.
   * `floating` sits inside a `StickyActionBar`: each action is its own glass
   *  capsule (`GlassButton`), Call tinted brand red and Message clear glass.
   */
  variant?: "bar" | "viewer" | "floating";
  /** Runs before a Message starts, e.g. to close the photo viewer over the screen. */
  onBeforeMessage?: () => void;
  /**
   * False for a second bar on the same screen, so a Message replayed after
   * sign-in opens one Conversation, not two.
   */
  replayAuth?: boolean;
}

export function ContactCtaBar({
  listingId,
  contactPhone,
  allowCalls,
  allowChat,
  status,
  pending = false,
  variant = "bar",
  onBeforeMessage,
  replayAuth = true,
}: ContactCtaBarProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const conversation = useOpenListingConversation(listingId);
  const { t } = useTranslation();
  const listingHref = `/(public)/listings/${listingId}` as const;
  const isSold = status === Enums.ListingStatus.Sold;
  const isArchived = status === Enums.ListingStatus.Archived;
  const canCall =
    !pending && allowCalls && !!contactPhone && !isSold && !isArchived;
  const canMessage = !pending && allowChat && !isSold && !isArchived;
  // A loaded, open Listing that takes no calls has no Call button at all, as on
  // the Results and Favorites cards. Loading, sold and archived keep it, disabled.
  // While detail loads the phone is not known yet: Call holds its place
  // whenever the card says the seller takes calls.
  const showCall = isSold || isArchived || (pending ? allowCalls : allowCalls && !!contactPhone);
  const onDark = variant === "viewer";
  // Inside the sticky action bar the bar supplies the padding.
  const floating = variant === "floating";
  // Side by side, a large label is cut; stacked, each button has the full width.
  const largeText = useLargeText();

  const handleCall = async () => {
    if (!canCall || !contactPhone) return;
    emitMeasurement({ eventName: "call_intent", purpose: "product_improvement", payload: { listingId } });
    await openSellerDialer(contactPhone, t);
  };

  // `conversation.open` is the action body without the auth gate, so one
  // code path serves a signed-in tap and a pending action replayed after
  // sign-in. A replay must not re-check `isAuthenticated`: that
  // flag is refreshed asynchronously and is still false for a beat after the
  // session is stored, while the API client already reads the new token per
  // request.
  useReplayAuthAction("message", replayAuth ? listingId : undefined, () =>
    conversation.open(),
  );

  const handleMessage = () => {
    if (!canMessage) return;
    onBeforeMessage?.();

    if (isAuthenticated === false) {
      useAuthIntentStore.getState().requireSignIn(router, {
        returnTo: listingHref,
        action: { kind: "message", listingId },
      });
      return;
    }

    if (isAuthenticated === true) {
      conversation.open();
    }
  };

  const messageDisabled = !canMessage || conversation.isPending;
  const floatingActions = (
    <>
      {showCall ? (
        <GlassButton tone={canCall ? "brand" : "neutral"} className={cn(!largeText && "flex-1")}
          onPress={handleCall} disabled={!canCall} accessibilityLabel={t("call")}>
          <Icon as={Phone} className="size-5" />
          <Text>{t("call")}</Text>
        </GlassButton>
      ) : null}
      <GlassButton className={cn(!largeText && "flex-1")} disabled={messageDisabled} onPress={handleMessage}
        accessibilityLabel={t("message")} accessibilityState={{ disabled: messageDisabled }}>
        <Icon as={MessageCircle} className="size-5" />
        <Text>{t("message")}</Text>
      </GlassButton>
    </>
  );

  return (
    <View>
      <View className={cn(largeText ? "gap-2" : "flex-row items-center gap-2", floating ? "" : "px-4 py-3")}>
        {floating ? floatingActions : <>
        {showCall ? (
        <Button
          variant={canCall ? "brand" : "secondary"}
          size="lg"
          className={cn(
            !largeText && "flex-1",
            onDark && !canCall && "border-transparent bg-white/15 disabled:border-transparent disabled:bg-white/15",
          )}
          onPress={handleCall}
          disabled={!canCall}
        >
          <Icon as={Phone} className="size-5" />
          <Text className={cn(onDark && !canCall && "text-white/60")}>
            {t("call")}
          </Text>
        </Button>
        ) : null}

        <Button
          variant={canMessage ? "default" : "secondary"}
          size="lg"
          className={cn(
            !largeText && "flex-1",
            onDark && "border-transparent bg-white/15 disabled:border-transparent disabled:bg-white/15",
          )}
          disabled={!canMessage || conversation.isPending}
          onPress={handleMessage}
          accessibilityLabel={t("message")}
          accessibilityState={{
            disabled: !canMessage || conversation.isPending,
          }}
        >
          <Icon
            as={MessageCircle}
            className={
              onDark
                ? "size-5 text-white"
                : canMessage
                  ? "size-5 text-background"
                  : "size-5 text-muted-foreground"
            }
          />
          <Text className={cn(onDark && "text-white")}>
            {t("message")}
          </Text>
        </Button>
        </>}
      </View>
      {conversation.error && (
        // The floating bar has no material, so the tinted error gets a solid card under it.
        <View className={floating ? "mt-2 overflow-hidden rounded-lg bg-card shadow-floating" : "px-4 pb-3"}>
          <ErrorState
            compact
            error={conversation.error}
            onRetry={conversation.retry}
          />
        </View>
      )}
    </View>
  );
}
