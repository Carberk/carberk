import type { ReactNode } from "react";
import { Heart, MoreHorizontal } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { useAuth } from "../../auth/useAuth";
import { useListingFavorite } from "../useListingFavorite";
import { formatPrice } from "../formatPrice";

import { isClosedForContact } from "./closedListing";
import { DetailHeader } from "./DetailHeader";
import { listingTitle } from "./presentation";
import type { CatalogMaps } from "./useCatalogMaps";

import { HeaderButton, HeaderCircleButton } from "@/components/navigation/StackHeader";
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
  /** The photos have scrolled away: the price and title take the middle of the row. */
  collapsed: boolean;
  /** The page has scrolled at all: a hairline sits under the row. */
  scrolled: boolean;
  topInset: number;
  onBack: () => void;
  onReport?: () => void;
  ownerMenu?: ReactNode;
}

/** Loaded Listing detail's header row: Back, the collapsed price and title, ♡ and ⋯ (or the owner's menu). */
export function CollapsingHeader({
  listing,
  maps,
  collapsed,
  scrolled,
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
    <DetailHeader
      topInset={topInset}
      scrolled={scrolled}
      onBack={onBack}
      trailing={ownerMenu ?? (
        <>
          {!closed && (
            <HeaderCircleButton
              tone="plain"
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
                  tone="plain"
                  icon={MoreHorizontal}
                  accessibilityLabel={t("detailOptions")}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem accessibilityRole="button" onPress={onReport}>
                  <Text>{t("report")}</Text>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
    >
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
    </DetailHeader>
  );
}
