import { router } from "expo-router";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { Heart, MessageCircle, Phone } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { useAuthIntentStore, type AuthHref } from "../../auth/intentStore";
import { useOpenListingConversation } from "../../conversations/useOpenListingConversation";
import { useDisplayName } from "../../identity/useDisplayName";
import { formatPrice } from "../formatPrice";
import { useListingFavorite } from "../useListingFavorite";

import { feedCardFields, feedCardPhotoKeys } from "./feedCardFields";
import { formatListingDate } from "./formatListingDate";
import { CARD_INSET, ListingPhotoStrip, STRIP_HEIGHT_SHARE, STRIP_INSET } from "./ListingPhotoStrip";
import { listingSpecLine } from "./listingSpecLine";
import { useListingCall } from "./useListingCall";

import { ErrorState } from "@/components/ErrorState";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EnterOnce, MotionView, Pop, usePressScale } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { tabularFigures } from "@/lib/font";

export { formatListingDate } from "./formatListingDate";

interface ListingLargeCardProps {
  listing: ListingsSchemas.FeedListingSummary;
  onPress: (id: string) => void;
  brandName?: string; modelName?: string; cityName?: string; transmissionName?: string; engineTypeName?: string;
  /** `null` while the session loads: Call and Message wait until the viewer is known. */
  isAuthenticated: boolean | null;
  /** The signed-in User; their own Listing offers no Call or Message, as on detail. */
  viewerId?: string | null;
  /** The screen sign-in returns to before finishing a ♡ or a Message. */
  returnTo: AuthHref;
  /** The card's place in the first page's staggered arrival; leave it out for a card that should simply be there. */
  enterOrder?: number;
}

/**
 * The square tonal action beside Call: one glyph, the same height and radius
 * as Call. The minimum width keeps it square where no Call stretches the row.
 */
export function SquareAction({ children, ...props }: Omit<ButtonProps, "variant" | "size" | "children"> & { children: ReactNode }) {
  return <Button variant="secondary" className="aspect-square min-w-control-md px-0" {...props}>{children}</Button>;
}

function FavoriteAction({ listingId, isFavorited, isAuthenticated, returnTo }: { listingId: string; isFavorited: boolean; isAuthenticated: boolean | null; returnTo: AuthHref }) {
  const { t } = useTranslation();
  const { favorited, toggle } = useListingFavorite({ listingId, isFavorited, isAuthenticated, returnTo });
  return <SquareAction onPress={toggle} accessibilityLabel={t("favorite")} accessibilityState={{ selected: favorited }}>
    <Pop active={favorited}>
      <Icon as={Heart} className={favorited ? "size-5 text-brand-500 fill-brand-500" : "size-5 text-foreground"} strokeWidth={2} />
    </Pop>
  </SquareAction>;
}

/**
 * Call and Message as Listing detail has them. Call reads the phone from the
 * detail query on tap and needs no sign-in. Message opens the Conversation;
 * signed out, it asks for sign-in with a pending Message that Results
 * finishes on return (`FeedMessageReplay`), and it does nothing while the
 * session loads.
 */
function useContactActions(listingId: string, isAuthenticated: boolean | null, returnTo: AuthHref) {
  const phone = useListingCall(listingId);
  const conversation = useOpenListingConversation(listingId);
  const message = () => {
    if (isAuthenticated === false) {
      useAuthIntentStore.getState().requireSignIn(router, { returnTo, action: { kind: "message", listingId } });
      return;
    }
    if (isAuthenticated === true) conversation.open();
  };
  return { phone, conversation, message };
}

function SellerLine({ seller, cityName, date }: { seller: ReturnType<typeof feedCardFields>["seller"]; cityName?: string; date: string }) {
  const { t } = useTranslation();
  const displayNameOf = useDisplayName();
  // As detail's seller block: a deleted seller has no name, and "Private seller" then stands alone.
  const name = seller && !seller.deleted ? displayNameOf(seller) : null;
  const title = name ?? (seller ? t("privateSeller") : null);
  const meta = [name ? t("privateSeller") : null, cityName, date].filter(Boolean).join(" · ");
  return <View testID="listing-seller" className="min-w-0 flex-1 gap-0.5">
    {title ? <Text className="text-callout font-semibold text-foreground" numberOfLines={1}>{title}</Text> : null}
    <Text className="text-footnote text-muted-foreground" numberOfLines={1}>{meta}</Text>
  </View>;
}

/**
 * The Results card: one raised object with a 28 dp radius. The photo strip
 * sits inside its top, set in from the top and left edges, with the photo
 * count and a seller-stated "New" on its bottom edge. Below: the price, the
 * loudest thing on the card, in plain bold tabular figures with nothing
 * behind it; the spec line; "Brand Model, year" a step quieter. Then the actions: Call full width in brand red when
 * the seller takes calls, Message and ♡ as square tonal buttons beside it
 * (Message takes the full width, tonal, when there is no Call). Last, the
 * seller's name and "Private seller · City · date". With neither Call nor
 * Message (the seller turned both off, an older API, or the User's own
 * Listing) the ♡ sits at the end of the seller line instead.
 *
 * The photos and the text under them open the Listing and give under a
 * finger; the buttons are controls of their own beside that area, so a
 * screen reader reaches each one.
 */
export const ListingLargeCard = memo(function ListingLargeCard(props: ListingLargeCardProps) {
  const { listing, onPress, brandName, modelName, cityName, transmissionName, engineTypeName, isAuthenticated, viewerId, returnTo, enterOrder } = props;
  const { t, i18n } = useTranslation();
  const press = usePressScale("surface");
  const feed = feedCardFields(listing);
  const price = formatPrice(listing.displayPriceTmt, i18n.language);
  const identity = [brandName, modelName].filter(Boolean).join(" ");
  const title = [identity, listing.year].filter((value) => value != null && value !== "").join(", ");
  const specs = listingSpecLine({ mileageKm: listing.mileageKm, transmissionName, engineTypeName, locale: i18n.language, kmLabel: t("km") });
  const contacts = useContactActions(listing.id, isAuthenticated, returnTo);
  // As on detail: nothing to contact on the User's own Listing, and nothing until the viewer is known.
  const canContact = isAuthenticated !== null && (viewerId == null || viewerId !== listing.sellerId);
  const canCall = canContact && feed.allowCalls === true;
  const canMessage = canContact && feed.allowChat === true;
  const favorite = <FavoriteAction listingId={listing.id} isFavorited={listing.isFavorited ?? false} isAuthenticated={isAuthenticated} returnTo={returnTo} />;
  const error = contacts.phone.error ?? contacts.conversation.error;
  const retry = contacts.phone.error ? contacts.phone.retry : contacts.conversation.retry;

  return <EnterOnce order={enterOrder}>
    <MotionView style={press.style} className="overflow-hidden rounded-3xl bg-card">
      <ListingPhotoStrip photoKeys={feedCardPhotoKeys(listing)} photoCount={listing.photoCount} condition={listing.condition}
        onOpen={() => onPress(listing.id)} {...press.handlers} />
      <Pressable onPress={() => onPress(listing.id)} {...press.handlers} accessibilityRole="button" accessibilityLabel={[title, price].filter(Boolean).join(", ")}>
        <View className="items-start gap-1 px-4 pt-3.5">
          <Text className="mb-0.5 font-heading text-headline font-bold text-foreground" style={tabularFigures} numberOfLines={1}>{price}</Text>
          {specs ? <Text className="text-callout text-foreground" style={tabularFigures} numberOfLines={1}>{specs}</Text> : null}
          {title ? <Text className="text-callout text-muted-foreground" style={tabularFigures} numberOfLines={1}>{title}</Text> : null}
        </View>
      </Pressable>
      <View className="gap-3 px-4 pb-4 pt-3.5">
        {canCall || canMessage ? <View className="flex-row gap-2">
          {canCall ? <Button variant="brand" className="flex-1" onPress={contacts.phone.call} accessibilityLabel={t("call")} accessibilityState={{ busy: contacts.phone.isPending }}>
            <Icon as={Phone} className="size-5" /><Text numberOfLines={1}>{t("call")}</Text>
          </Button> : null}
          {canMessage ? canCall
            ? <SquareAction onPress={contacts.message} disabled={contacts.conversation.isPending} accessibilityLabel={t("message")} accessibilityState={{ disabled: contacts.conversation.isPending }}>
              <Icon as={MessageCircle} className="size-5 text-foreground" />
            </SquareAction>
            : <Button variant="secondary" className="flex-1" onPress={contacts.message} disabled={contacts.conversation.isPending} accessibilityLabel={t("message")} accessibilityState={{ disabled: contacts.conversation.isPending }}>
              <Icon as={MessageCircle} className="size-5 text-foreground" /><Text numberOfLines={1}>{t("message")}</Text>
            </Button> : null}
          {favorite}
        </View> : null}
        {error ? <ErrorState compact error={error} onRetry={retry} /> : null}
        <View className="flex-row items-center gap-3">
          <SellerLine seller={feed.seller} cityName={cityName} date={formatListingDate(listing.publishedAt, i18n.language, t)} />
          {canCall || canMessage ? null : favorite}
        </View>
      </View>
    </MotionView>
  </EnterOnce>;
});

/** Skeleton in the card's shape: the inset photo strip, the price, two lines, the action row and the seller line. */
export function ListingLargeCardSkeleton() {
  const { width } = useWindowDimensions();
  return <View className="overflow-hidden rounded-3xl bg-card">
    {/* As the strip at rest: clear of the top and left edges, running out to the right one. */}
    <View testID="listing-photo-skeleton" style={{ height: Math.round((width - CARD_INSET * 2) * STRIP_HEIGHT_SHARE), marginTop: STRIP_INSET, marginLeft: STRIP_INSET }}>
      <Skeleton className="h-full w-full rounded-l-xl rounded-r-none" />
    </View>
    {/* Each bar sits in its line's height (price 28, lines 20), so the list does not jump when the cards arrive. */}
    <View className="items-start gap-1 px-4 pt-3.5">
      <Skeleton className="mb-0.5 h-7 w-2/5 rounded-md" /><Skeleton className="my-1 h-3 w-4/5" /><Skeleton className="my-1 h-3 w-1/2" />
    </View>
    <View className="gap-3 px-4 pb-4 pt-3.5">
      <View className="flex-row gap-2">
        <Skeleton className="h-control-md flex-1 rounded-xl" /><Skeleton className="aspect-square h-control-md rounded-xl" /><Skeleton className="aspect-square h-control-md rounded-xl" />
      </View>
      <View className="gap-1.5"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2" /></View>
    </View>
  </View>;
}
