import { useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { GalleryBanner } from "./GalleryImage";

import { Text } from "@/components/ui/text";

/**
 * Listing detail's photo frame, width to height (#864). Phones shoot 4:3 by
 * default and car marketplaces frame listing photos at 4:3, so a typical photo
 * fills it edge to edge. Any other photo shows whole inside it on the muted
 * surface and is never cropped.
 */
export const LISTING_PHOTO_ASPECT_RATIO = 4 / 3;

/**
 * The full-width frame of every Listing detail photo state: the tapped card's
 * preview, the deep-link skeleton, the gallery and No photos. All take this one
 * size, so the photo never moves while detail loads or as the buyer swipes.
 */
export function useListingPhotoFrame() {
  const { width } = useWindowDimensions();
  return useMemo(() => ({ width, height: width / LISTING_PHOTO_ASPECT_RATIO }), [width]);
}

/** The photo frame of a Listing without photos. */
export function NoPhotosFrame({ banner }: { banner?: string }) {
  const { t } = useTranslation();
  const frame = useListingPhotoFrame();
  return (
    <View
      testID="listing-photo-frame"
      className="items-center justify-center bg-muted"
      style={frame}
    >
      <Text className="text-callout text-muted-foreground">{t("noPhotos")}</Text>
      {banner && <GalleryBanner label={banner} />}
    </View>
  );
}
