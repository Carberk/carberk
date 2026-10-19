import * as Linking from "expo-linking";
import { Enums, type ListingsSchemas } from "@auto-tm/contracts";
import { Camera, MessageCircle, Phone } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { useOpenListingConversation } from "../../conversations/useOpenListingConversation";
import { formatPrice } from "../formatPrice";
import { formatListingDate } from "../feed/formatListingDate";
import { ListingPhoto, PhotoChip, PhotoFavoriteButton } from "../feed/ListingPhoto";
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

/** A photo frame. `flex` is its share of the row: one wide frame, or 62 and 38 for the two-photo grid. */
function Photo({ mediaKey, flex }: { mediaKey?: string; flex: number }) {
  const { t } = useTranslation();
  return <View testID="listing-photo" style={{ flex }} className="h-full min-w-0 overflow-hidden bg-secondary">
    <ListingPhoto mediaKey={mediaKey} emptyLabel={t("noPhotos")} />
  </View>;
}

/** Call opens the dialer with the Listing contact phone; Message opens the Conversation about the Listing. */
function ContactActions({ listing }: { listing: ListingsSchemas.FavoriteListingSummary }) {
  const { t } = useTranslation();
  const conversation = useOpenListingConversation(listing.id);
  const phone = listing.allowCalls ? listing.contactPhone : undefined;
  if (!phone && !listing.allowChat) return null;
  const call = async () => {
    const url = `tel:${phone}`;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  };
  return <View className="gap-2 px-4 pb-4">
    <View className="flex-row gap-2">
      {phone ? <Button variant="brand" className="flex-1 rounded-full" onPress={() => void call()} accessibilityLabel={t("call")}>
        <Icon as={Phone} className="size-5" /><Text numberOfLines={1}>{t("call")}</Text>
      </Button> : null}
      {listing.allowChat ? <Button variant="secondary" className="flex-1 rounded-full" disabled={conversation.isPending}
        onPress={() => conversation.open()} accessibilityLabel={t("message")} accessibilityState={{ disabled: conversation.isPending }}>
        <Icon as={MessageCircle} className="size-5 text-foreground" /><Text numberOfLines={1}>{t("message")}</Text>
      </Button> : null}
    </View>
    {conversation.error ? <ErrorState compact error={conversation.error} onRetry={conversation.retry} /> : null}
  </View>;
}

/**
 * The Favorites card: one raised object. The photo band fills its top edge to
 * edge (one wide photo, or 62% and 38% for two), with a filled ♥ that removes
 * the Favorite, the photo count and, on a closed Listing, its state. Below:
 * the price loudest, "Brand Model, year" a step quieter, then the spec line
 * and the city and date, both quiet. Call and Message sit under an active
 * Listing that is not the User's own; a sold or archived Listing is dimmed
 * with its label and no contact buttons. The whole card gives under a finger;
 * the heart and the contact buttons are controls of their own beside the
 * pressable area. Results has its own card (`ListingLargeCard`).
 */
export const FavoriteListingCard = memo(function FavoriteListingCard(props: FavoriteListingCardProps) {
  const { listing, onPress, brandName, modelName, cityName, transmissionName, engineTypeName, isOwn, onRemoveFavorite, enterOrder } = props;
  const { t, i18n } = useTranslation();
  const press = usePressScale("surface");
  const photoKeys = listing.photoKeys.length ? listing.photoKeys : listing.coverMediaKey ? [listing.coverMediaKey] : [];
  const price = formatPrice(listing.displayPriceTmt, i18n.language);
  const identity = [brandName, modelName].filter(Boolean).join(" ");
  const title = [identity, listing.year].filter((value) => value != null && value !== "").join(", ");
  const specs = listingSpecLine({ mileageKm: listing.mileageKm, transmissionName, engineTypeName, locale: i18n.language, kmLabel: t("km") });
  const location = [cityName, formatListingDate(listing.publishedAt, i18n.language, t)].filter(Boolean).join(" · ");
  const sold = listing.status === Enums.ListingStatus.Sold;
  const closedLabel = sold ? t("sold") : listing.status === Enums.ListingStatus.Archived ? t("removedFromSale") : null;
  return <EnterOnce order={enterOrder} className="mx-4">
    <MotionView style={press.style} className="overflow-hidden rounded-2xl bg-card">
      <Pressable onPress={() => onPress(listing.id)} {...press.handlers} accessibilityRole="button" accessibilityLabel={[title, price, closedLabel].filter(Boolean).join(", ")}>
        <View>
          <View testID="listing-photos" className={cn("aspect-photo-wide flex-row gap-0.5", closedLabel && "opacity-50")}>
            {photoKeys.length > 1 ? <>
              <Photo mediaKey={photoKeys[0]} flex={62} />
              <Photo mediaKey={photoKeys[1]} flex={38} />
            </> : <Photo mediaKey={photoKeys[0]} flex={1} />}
          </View>
          {listing.photoCount > 1 ? <PhotoChip icon={Camera} label={String(listing.photoCount)} className="bottom-2 left-2"
            accessibilityLabel={t("resultsPhotoCount", { count: listing.photoCount })} /> : null}
          {closedLabel ? <PhotoChip label={closedLabel} tone={sold ? "solid" : "quiet"} className="left-3 top-3" /> : null}
        </View>
        <View className="gap-0.5 px-4 pb-4 pt-3">
          <Text className={cn("font-heading text-headline font-bold", closedLabel ? "text-muted-foreground" : "text-foreground")} style={tabularFigures} numberOfLines={1}>{price}</Text>
          {title ? <Text className="text-body font-medium text-foreground" numberOfLines={1}>{title}</Text> : null}
          {specs ? <Text className="text-callout text-muted-foreground" numberOfLines={1}>{specs}</Text> : null}
          <Text className="pt-2 text-footnote text-muted-foreground" numberOfLines={1}>{location}</Text>
        </View>
      </Pressable>
      {!closedLabel && !isOwn ? <ContactActions listing={listing} /> : null}
      <PhotoFavoriteButton favorited onPress={() => onRemoveFavorite(listing)}
        accessibilityLabel={t("removeFromFavorites")} accessibilityState={{ selected: true }} />
    </MotionView>
  </EnterOnce>;
});

/** Skeleton in the card's shape, with the Call and Message buttons. */
export function FavoriteListingCardSkeleton() {
  return <View className="mx-4 overflow-hidden rounded-2xl bg-card">
    <View testID="listing-photo-skeleton" className="aspect-photo-wide"><Skeleton className="h-full w-full rounded-none" /></View>
    {/* Each bar fills its text line (28, 22, 20 and 18 dp), so the list does not jump when the cards arrive. */}
    <View className="gap-0.5 px-4 pb-4 pt-3">
      <Skeleton className="my-1.5 h-4 w-2/5" /><Skeleton className="my-1 h-3.5 w-3/5" /><Skeleton className="my-1 h-3 w-4/5" />
      <Skeleton className="mb-1 mt-3 h-2.5 w-1/3" />
    </View>
    <View testID="listing-actions-skeleton" className="flex-row gap-2 px-4 pb-4">
      <Skeleton testID="skeleton-button" className="h-control-md flex-1 rounded-full" /><Skeleton testID="skeleton-button" className="h-control-md flex-1 rounded-full" />
    </View>
  </View>;
}
