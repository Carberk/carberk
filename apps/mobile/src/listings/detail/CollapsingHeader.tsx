import type { ReactNode } from "react";
import { View } from "react-native";
import { Heart, MoreHorizontal } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { useAuth } from "../../auth/useAuth";
import { useListingFavorite } from "../useListingFavorite";
import { formatPrice } from "../formatPrice";

import { isClosedForContact } from "./closedListing";
import { listingTitle } from "./presentation";
import type { CatalogMaps } from "./useCatalogMaps";

import {
  BackButton,
  HeaderButton,
  HeaderCircleButton,
} from "@/components/navigation/StackHeader";
import { GlassGroup } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { Pop } from "@/components/ui/motion";
import { Text } from "@/components/ui/text";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  listing: ListingsSchemas.ListingDetail;
  maps: CatalogMaps;
  collapsed: boolean;
  topInset: number;
  onBack: () => void;
  onReport?: () => void;
  ownerMenu?: ReactNode;
}
export function CollapsingHeader({
  listing,
  maps,
  collapsed,
  topInset,
  onBack,
  onReport,
  ownerMenu,
}: Props) {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const favorite = useListingFavorite({
    listingId: listing.id,
    isFavorited: listing.isFavorited ?? false,
    isAuthenticated,
    returnTo: `/(public)/listings/${listing.id}`,
    replayAfterSignIn: true,
  });
  const closed = isClosedForContact(listing.status);
  const canReport = !closed && onReport !== undefined;
  return (
    <View
      className={cn(
        "absolute top-0 left-0 right-0 z-20",
        collapsed && "bg-background",
      )}
      style={{ paddingTop: topInset }}
    >
      <View className="flex-row items-center gap-1 px-3 py-2">
        <BackButton tone="glass" accessibilityLabel={t("back")} onPress={onBack} />
        <View className="min-w-0 flex-1 px-1">
          {collapsed && (
            <>
              <Text
                className={cn(
                  "text-callout font-bold",
                  closed ? "text-muted-foreground" : "text-foreground",
                )}
                numberOfLines={1}
              >
                {formatPrice(listing.displayPriceTmt, i18n.language)}
              </Text>
              <Text className="text-caption text-muted-foreground" numberOfLines={1}>
                {listingTitle(listing, maps, false)}
              </Text>
            </>
          )}
        </View>
        {ownerMenu ?? (
          // Two circles side by side share one glass layer on iOS 26.
          <GlassGroup className="flex-row items-center gap-2">
            {!closed && (
              <HeaderCircleButton
                tone="glass"
                accessibilityLabel={t("favorite")}
                accessibilityState={{ selected: favorite.favorited }}
                disabled={isAuthenticated === null}
                onPress={favorite.toggle}
              >
                <Pop active={favorite.favorited}>
                  <Icon
                    as={Heart}
                    className={
                      favorite.favorited
                        ? "size-5 text-primary fill-primary"
                        : "size-5 text-foreground"
                    }
                  />
                </Pop>
              </HeaderCircleButton>
            )}
            {canReport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <HeaderButton
                    tone="glass"
                    icon={MoreHorizontal}
                    accessibilityLabel={t("detailOptions")}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    accessibilityRole="button"
                    onPress={onReport}
                  >
                    <Text>{t("report")}</Text>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </GlassGroup>
        )}
      </View>
    </View>
  );
}
