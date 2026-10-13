import { Enums, type ListingsSchemas } from "@auto-tm/contracts";
import { Heart, MessageCircle, Phone } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { openSellerDialer } from "../openSellerDialer";
import { useOpenListingConversation } from "../../conversations/useOpenListingConversation";
import { formatPrice } from "../formatPrice";
import { formatListingDate } from "../feed/formatListingDate";
import { PhotoChip } from "../feed/ListingPhoto";
import { feedCardPhotoKeys, feedCardPhotoThumbHashes } from "../feed/feedCardFields";
import { SquareAction } from "../feed/ListingLargeCard";
import { CARD_INSET, ListingPhotoStrip, STRIP_HEIGHT_SHARE, STRIP_INSET } from "../feed/ListingPhotoStrip";
import { listingSpecLine } from "../feed/listingSpecLine";

import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EnterOnce, MotionView, usePressScale } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { tabularFigures } from "@/lib/font";
import { cn } from "@/lib/utils";

interface FavoriteListingCardProps {
  listing: ListingsSchemas.FavoriteListingSummary;
  onPress: (id: string) => void;
  brandName?: string; modelName?: string; cityName?: string; transmissionName?: string; engineTypeName?: string;
  /** The User's own Listing gets no contact buttons. */
  isOwn: boolean;
  onRemoveFavorite: (listing: ListingsSchemas.FavoriteListingSummary) => void;
  /** The card's place in the first page's staggered arrival; leave it out for a card that should simply be there. */
  enterOrder?: number;
}

/** The filled ♥ as a square tonal button, as on the Results card; it removes the Favorite. */
function RemoveFavoriteAction({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return <SquareAction onPress={onPress} accessibilityLabel={t("removeFromFavorites")} accessibilityState={{ selected: true }}>
    <Icon as={Heart} className="size-5 fill-brand-500 text-brand-500" strokeWidth={2} />
  </SquareAction>;
}

/**
 * Call opens the dialer with the Listing contact phone; Message opens the
 * Conversation about the Listing. As on the Results card: Call full width in
 * brand red, Message a square tonal button beside it (full width and tonal when
 * there is no Call), then the ♥. Renders nothing when neither is offered.
 */
function ContactActions({ listing, favorite }: { listing: ListingsSchemas.FavoriteListingSummary; favorite: ReactNode }) {
  const { t } = useTranslation();
  const conversation = useOpenListingConversation(listing.id);
  const phone = listing.allowCalls ? listing.contactPhone : undefined;
  if (!phone && !listing.allowChat) return null;
  const call = async () => {
    if (phone) await openSellerDialer(phone, t);
  };
  const messageState = { disabled: conversation.isPending };
  return <View className="gap-3">
    <View testID="listing-actions" className="flex-row gap-2">
      {phone ? <Button variant="brand" className="flex-1" onPress={() => void call()} accessibilityLabel={t("call")}>
        <Icon as={Phone} className="size-5" /><Text numberOfLines={1}>{t("call")}</Text>
      </Button> : null}
      {listing.allowChat ? phone
        ? <SquareAction disabled={conversation.isPending} onPress={() => conversation.open()} accessibilityLabel={t("message")} accessibilityState={messageState}>
          <Icon as={MessageCircle} className="size-5 text-foreground" />
        </SquareAction>
        : <Button variant="secondary" className="flex-1" disabled={conversation.isPending} onPress={() => conversation.open()} accessibilityLabel={t("message")} accessibilityState={messageState}>
          <Icon as={MessageCircle} className="size-5 text-foreground" /><Text numberOfLines={1}>{t("message")}</Text>
        </Button> : null}
      {favorite}
    </View>
    {conversation.error ? <ErrorState compact error={conversation.error} onRetry={conversation.retry} /> : null}
  </View>;
}

/**
 * The Favorites card, built as the Results card (`ListingLargeCard`): one
 * raised object across the screen with a 28 dp radius, the swipeable photo
 * strip set in from its top and left edges, then the price loudest, the spec
 * line and "Brand Model, year" a step quieter. Below, Call, Message and a
 * filled ♥ that removes the Favorite, then the city and date. Without Call or
 * Message (the User's own Listing, a seller who turned both off, or a closed
 * Listing) the ♥ ends the city and date line instead.
 *
 * A sold or archived Listing is dimmed with its label on the photos and has
 * no contact buttons; its ♥ still removes it. The photos and the text open the
 * Listing and give under a finger; the buttons are controls of their own.
 */
export const FavoriteListingCard = memo(function FavoriteListingCard(props: FavoriteListingCardProps) {
  const { listing, onPress, brandName, modelName, cityName, transmissionName, engineTypeName, isOwn, onRemoveFavorite, enterOrder } = props;
  const { t, i18n } = useTranslation();
  const press = usePressScale("surface");
  const price = formatPrice(listing.displayPriceTmt, i18n.language);
  const identity = [brandName, modelName].filter(Boolean).join(" ");
  const title = [identity, listing.year].filter((value) => value != null && value !== "").join(", ");
  const specs = listingSpecLine({ mileageKm: listing.mileageKm, transmissionName, engineTypeName, locale: i18n.language, kmLabel: t("km") });
  const location = [cityName, formatListingDate(listing.publishedAt, i18n.language, t)].filter(Boolean).join(" · ");
  const sold = listing.status === Enums.ListingStatus.Sold;
  const closedLabel = sold ? t("sold") : listing.status === Enums.ListingStatus.Archived ? t("removedFromSale") : null;
  const phone = listing.allowCalls ? listing.contactPhone : undefined;
  const hasContact = !closedLabel && !isOwn && (Boolean(phone) || listing.allowChat === true);
  const favorite = <RemoveFavoriteAction onPress={() => onRemoveFavorite(listing)} />;
  return <EnterOnce order={enterOrder}>
    <MotionView testID="favorite-card" style={press.style} className="overflow-hidden rounded-3xl bg-card">
      <View>
        <View testID="listing-photos-frame" className={cn(closedLabel && "opacity-50")}>
          <ListingPhotoStrip photoKeys={feedCardPhotoKeys(listing)} thumbHashes={feedCardPhotoThumbHashes(listing)} photoCount={listing.photoCount}
            onOpen={() => onPress(listing.id)} {...press.handlers} />
        </View>
        {closedLabel ? <PhotoChip label={closedLabel} tone={sold ? "solid" : "quiet"} className="left-4 top-4" /> : null}
      </View>
      <Pressable onPress={() => onPress(listing.id)} {...press.handlers} accessibilityRole="button" accessibilityLabel={[title, price, closedLabel].filter(Boolean).join(", ")}>
        <View className="items-start gap-1 px-4 pt-3.5">
          <Text className={cn("mb-0.5 font-heading text-headline font-bold", closedLabel ? "text-muted-foreground" : "text-foreground")} style={tabularFigures} numberOfLines={1}>{price}</Text>
          {specs ? <Text className="text-callout text-foreground" style={tabularFigures} numberOfLines={1}>{specs}</Text> : null}
          {title ? <Text className="text-callout text-muted-foreground" style={tabularFigures} numberOfLines={1}>{title}</Text> : null}
        </View>
      </Pressable>
      <View className="gap-3 px-4 pb-4 pt-3.5">
        {hasContact ? <ContactActions listing={listing} favorite={favorite} /> : null}
        <View testID="listing-meta" className="min-h-6 flex-row items-center gap-3">
          <Text className="min-w-0 flex-1 text-footnote text-muted-foreground" numberOfLines={1}>{location}</Text>
          {hasContact ? null : favorite}
        </View>
      </View>
    </MotionView>
  </EnterOnce>;
});

/** Skeleton in the card's shape: the inset photo strip, the price, two lines, the action row and the date line. */
export function FavoriteListingCardSkeleton() {
  const { width } = useWindowDimensions();
  return <View className="overflow-hidden rounded-3xl bg-card">
    <View testID="listing-photo-skeleton" style={{ height: Math.round((width - CARD_INSET * 2) * STRIP_HEIGHT_SHARE), marginTop: STRIP_INSET, marginLeft: STRIP_INSET }}>
      <Skeleton className="h-full w-full rounded-l-xl rounded-r-none" />
    </View>
    {/* Each bar sits in its line's height (price 28, lines 20), so the list does not jump when the cards arrive. */}
    <View className="items-start gap-1 px-4 pt-3.5">
      <Skeleton className="mb-0.5 h-7 w-2/5 rounded-md" /><Skeleton className="my-1 h-3 w-4/5" /><Skeleton className="my-1 h-3 w-1/2" />
    </View>
    <View className="gap-3 px-4 pb-4 pt-3.5">
      <View testID="listing-actions-skeleton" className="flex-row gap-2">
        <Skeleton testID="skeleton-button" className="h-control-md flex-1 rounded-xl" />
        <Skeleton testID="skeleton-button" className="aspect-square h-control-md rounded-xl" />
        <Skeleton testID="skeleton-button" className="aspect-square h-control-md rounded-xl" />
      </View>
      <Skeleton className="h-3 w-1/2" />
    </View>
  </View>;
}
