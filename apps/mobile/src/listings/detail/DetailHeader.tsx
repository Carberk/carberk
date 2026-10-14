import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Heart, MoreHorizontal } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { BackButton, HeaderButton } from "@/components/navigation/StackHeader";
import { cn } from "@/lib/utils";

/**
 * Listing detail's header row (#864): Back, then whatever the middle holds,
 * then the trailing actions, all plain icons on the page background under
 * the status bar. It sits in the page's flow, above the photos, not over
 * them. A hairline under it appears only once the page has scrolled. The
 * loaded detail, the card-seeded preview and the deep-link skeleton all use
 * this one row, so the photos below start at the same place in each.
 */
export function DetailHeader({
  topInset,
  scrolled = false,
  onBack,
  children,
  trailing,
}: {
  topInset: number;
  /** The page has scrolled: a hairline separates the header from it. */
  scrolled?: boolean;
  onBack: () => void;
  /** The middle: the collapsed price and title once the photos have scrolled away. */
  children?: ReactNode;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View
      testID="detail-header"
      className={cn("z-20 bg-background", scrolled ? "border-border" : "border-transparent")}
      style={{ paddingTop: topInset, borderBottomWidth: StyleSheet.hairlineWidth }}
    >
      <View className="flex-row items-center gap-1 px-1.5 py-1">
        <BackButton tone="plain" accessibilityLabel={t("back")} onPress={onBack} />
        <View className="min-w-0 flex-1 px-1">{children}</View>
        {trailing && <View className="flex-row items-center">{trailing}</View>}
      </View>
    </View>
  );
}

/**
 * The loaded header's actions, held disabled in their places until detail
 * arrives, so nothing appears in the row when it does: ♡ (filled when the
 * card says it is a Favorite) and ⋯ for a buyer on an open Listing, ⋯ alone
 * for the owner.
 */
export function PendingDetailActions({
  favorite,
  favorited = false,
  more,
}: {
  favorite: boolean;
  favorited?: boolean;
  more: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {favorite && (
        <HeaderButton
          tone="plain"
          icon={Heart}
          iconClassName={favorited ? "text-primary fill-primary" : undefined}
          accessibilityLabel={t("favorite")}
          accessibilityState={{ selected: favorited }}
          disabled
        />
      )}
      {more && <HeaderButton tone="plain" icon={MoreHorizontal} accessibilityLabel={t("detailOptions")} disabled />}
    </>
  );
}
