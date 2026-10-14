import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import type { ListingsSchemas } from "@auto-tm/contracts";
import type { ComponentProps } from "react";

import { buildOriginalUrl, listingPhotoUrl } from "../detail/buildVariantUrl";

import { Text } from "@/components/ui/text";

/** What `GalleryImage` needs of a photo: a Listing's media, or a card's photo key and ThumbHash. */
export type GalleryPhoto = Pick<ListingsSchemas.ListingMedia, "key"> & {
  variants?: Partial<ListingsSchemas.ListingMedia["variants"]> | undefined;
  thumbHash?: string | null | undefined;
};
type ExpoImageStyle = ComponentProps<typeof Image>["style"];

/**
 * Status strip across the bottom of a photo tile, e.g. "Sold" on a closed
 * Listing; the tile's rounded corners clip it. `hidden` keeps it from a
 * screen reader where the tile itself says the status.
 */
export function GalleryBanner({ label, hidden = false }: { label: string; hidden?: boolean }) {
  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2"
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    >
      <Text className="text-body font-bold text-white" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

type Variant = "thumbnail" | "list" | "detail" | "fullscreen";

/**
 * One Listing photo at a given size variant. Falls back to the original upload
 * when the variant is missing or fails to load. `placeholderVariant` names a
 * smaller size that is usually cached already (the strip's `detail` under the
 * viewer's `fullscreen`): it shows at once, drawn with the same fit so the
 * sharper photo replaces it in place without a jump or a blank frame.
 *
 * A photo with a ThumbHash shows its blurred colours before anything loads,
 * drawn in an Image underneath with the same fit. expo-image takes a single
 * placeholder and never selects a hash from a list, so the cached smaller
 * size stays the photo's own placeholder and appears over the blur at once.
 * Whenever a hash is set the tree is the same, so a zoom that swaps in the
 * fullscreen size changes only the photo's props and it sharpens in place.
 * The blur goes once the photo has loaded: a hash decodes at an approximate
 * aspect ratio, so beside a contain-fit photo it would show as bands.
 */
export function GalleryImage({
  item,
  variant,
  placeholderVariant,
  priority = "normal",
  contentFit,
  style,
  onAspectRatio,
  onDisplayedUri,
  sourceOverride,
}: {
  item: GalleryPhoto;
  variant: Variant;
  placeholderVariant?: Exclude<Variant, "fullscreen">;
  /** `high` for the photo on screen, `low` for a neighbour loading ahead. */
  priority?: "low" | "normal" | "high";
  contentFit: "cover" | "contain";
  style: ExpoImageStyle;
  /** Reports the loaded photo's width / height. */
  onAspectRatio?: (aspectRatio: number) => void;
  onDisplayedUri?: (uri: string) => void;
  sourceOverride?: string;
}) {
  const [useOriginalImage, setUseOriginalImage] = useState(false);
  const sourceUri = useOriginalImage ? buildOriginalUrl(item.key) : (sourceOverride ?? listingPhotoUrl(item, variant));
  const placeholderUri = placeholderVariant ? listingPhotoUrl(item, placeholderVariant) : undefined;
  const thumbHash = item.thumbHash;
  const [loaded, setLoaded] = useState(false);

  const photo = (
    <Image
      source={{ uri: sourceUri }}
      placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
      placeholderContentFit={contentFit}
      style={thumbHash ? StyleSheet.absoluteFill : style}
      contentFit={contentFit}
      priority={priority}
      cachePolicy="memory-disk"
      onDisplay={() => onDisplayedUri?.(sourceUri)}
      onLoad={(event) => {
        setLoaded(true);
        const { width, height } = event.source;
        if (width > 0 && height > 0) onAspectRatio?.(width / height);
      }}
      onError={() => setUseOriginalImage(true)}
    />
  );
  if (!thumbHash) return photo;

  return (
    <View style={style as ComponentProps<typeof View>["style"]}>
      {loaded ? null : (
        <Image source={{ thumbhash: thumbHash }} style={StyleSheet.absoluteFill} contentFit={contentFit} />
      )}
      {photo}
    </View>
  );
}
