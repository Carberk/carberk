import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { useTranslation } from "react-i18next";

import { GalleryBanner, GalleryCounter, GalleryImage } from "./GalleryImage";
import { isNearPhoto } from "./photoWindow";
import { PhotoViewer } from "./PhotoViewer";

import { Text } from "@/components/ui/text";

type ListingMedia = ListingsSchemas.ListingMedia;

interface PhotoGalleryProps {
  media: ListingMedia[];
  /** Status strip across the bottom of the photo, e.g. "Sold" on a closed Listing. */
  banner?: string;
  /** The photo viewer's top-right action (♡); omit it where the viewer has none. */
  viewerHeaderAction?: (close: () => void) => ReactNode;
  /** The photo viewer's bottom actions (Call + Message); omit them where it has none. */
  viewerFooter?: (close: () => void) => ReactNode;
}

export function PhotoGallery({
  media,
  banner,
  viewerHeaderAction,
  viewerFooter,
}: PhotoGalleryProps) {
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const listRef = useRef<FlatList<ListingMedia>>(null);

  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[] }) => {
      const first = info.viewableItems[0];
      if (first?.index != null) {
        setActiveIndex(first.index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // Closing the viewer lands the gallery on the photo the viewer was left on.
  const closeViewer = useCallback(
    (index: number) => {
      setViewerIndex(null);
      setActiveIndex(index);
      listRef.current?.scrollToOffset({ offset: index * screenWidth, animated: false });
    },
    [screenWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ListingMedia; index: number }) => {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("photoOf", { n: index + 1, total: media.length })}
          onPress={() => setViewerIndex(index)}
          className="active:opacity-90"
        >
          <View className="bg-muted" style={{ width: screenWidth, height: screenWidth * 0.65 }}>
            {isNearPhoto(index, activeIndex) && (
              <GalleryImage
                item={item}
                variant="detail"
                // The first photo is the card's: its `list` size is cached and shows at once.
                placeholderVariant={index === 0 ? "list" : undefined}
                priority={index === activeIndex ? "high" : "low"}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            )}
          </View>
        </Pressable>
      );
    },
    [screenWidth, media.length, activeIndex, t],
  );

  if (media.length === 0) {
    return (
      <View className="h-[240px] w-full items-center justify-center bg-muted">
        <Text className="text-callout text-muted-foreground">{t("noPhotos")}</Text>
        {banner && <GalleryBanner label={banner} />}
      </View>
    );
  }

  return (
    <View>
      <FlatList
        ref={listRef}
        data={media}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={activeIndex}
        initialNumToRender={1}
        windowSize={3}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      <GalleryCounter
        position={activeIndex + 1}
        total={media.length}
        aboveBanner={Boolean(banner)}
      />

      {banner && <GalleryBanner label={banner} />}

      <PhotoViewer
        visible={viewerIndex !== null}
        media={media}
        initialIndex={viewerIndex ?? 0}
        onClose={closeViewer}
        headerAction={viewerHeaderAction}
        footer={viewerFooter}
      />
    </View>
  );
}
