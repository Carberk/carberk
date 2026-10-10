import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import type { ListingsSchemas } from "@auto-tm/contracts";
import type { ComponentProps } from "react";

import { buildOriginalUrl, buildVariantUrl } from "../detail/buildVariantUrl";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Text } from "@/components/ui/text";
import { tabularFigures } from "@/lib/font";
import { MEDIA_CHIP_MAX_FONT_SCALE } from "@/lib/font-scale";
import { cn } from "@/lib/utils";

type ListingMedia = ListingsSchemas.ListingMedia;
type ExpoImageStyle = ComponentProps<typeof Image>["style"];

/** Status strip across the bottom of a photo, e.g. "Sold" on a closed Listing. */
export function GalleryBanner({ label }: { label: string }) {
  return (
    <View className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2">
      <Text className="text-body font-bold text-white" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The `n / N` photo position at the bottom-right of the Listing detail photo:
 * a small glass chip, so it floats over the car without a dark box on it.
 * It sits above the status strip when there is one.
 */
export function GalleryCounter({
  position,
  total,
  aboveBanner,
}: {
  position: number;
  total: number;
  aboveBanner: boolean;
}) {
  return (
    <GlassSurface
      className={cn(
        "absolute right-4 min-h-7 justify-center rounded-full px-3",
        aboveBanner ? "bottom-12" : "bottom-3",
      )}
    >
      <Text
        className="text-footnote font-medium text-foreground"
        style={tabularFigures}
        maxFontSizeMultiplier={MEDIA_CHIP_MAX_FONT_SCALE}
      >
        {`${position} / ${total}`}
      </Text>
    </GlassSurface>
  );
}

type Variant = "thumbnail" | "list" | "detail" | "fullscreen";

function variantUri(item: ListingMedia, variant: Variant): string {
  return item.variants[variant] || buildVariantUrl(item.key, variant);
}

/**
 * One Listing photo at a given size variant. Falls back to the original upload
 * when the variant is missing or fails to load. `placeholderVariant` names a
 * smaller size that is usually cached already (the card's `list`, or the
 * gallery's `detail` under the viewer's `fullscreen`): it shows at once, drawn
 * with the same fit so the sharper photo replaces it in place without a jump
 * or a blank frame.
 */
export function GalleryImage({
  item,
  variant,
  placeholderVariant,
  priority = "normal",
  contentFit,
  style,
  onAspectRatio,
}: {
  item: ListingMedia;
  variant: Variant;
  placeholderVariant?: Exclude<Variant, "fullscreen">;
  /** `high` for the photo on screen, `low` for a neighbour loading ahead. */
  priority?: "low" | "normal" | "high";
  contentFit: "cover" | "contain";
  style: ExpoImageStyle;
  /** Reports the loaded photo's width / height. */
  onAspectRatio?: (aspectRatio: number) => void;
}) {
  const [useOriginalImage, setUseOriginalImage] = useState(false);
  const sourceUri = useOriginalImage ? buildOriginalUrl(item.key) : variantUri(item, variant);
  const placeholderUri = placeholderVariant ? variantUri(item, placeholderVariant) : undefined;

  return (
    <Image
      source={{ uri: sourceUri }}
      placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
      placeholderContentFit={contentFit}
      style={style}
      contentFit={contentFit}
      priority={priority}
      cachePolicy="memory-disk"
      onLoad={(event) => {
        const { width, height } = event.source;
        if (width > 0 && height > 0) onAspectRatio?.(width / height);
      }}
      onError={() => setUseOriginalImage(true)}
    />
  );
}
